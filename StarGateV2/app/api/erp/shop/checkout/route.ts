/**
 * POST /api/erp/shop/checkout — 편의점 장바구니 결제.
 *
 * 여러 품목을 하나의 주문으로 검증하고, 총액을 한 번 차감한 뒤 인벤토리에 적재한다.
 * Mongo transaction 대신 기존 편의점 단품 구매와 같은 Saga 보상 패턴을 사용한다.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  addToInventory,
  findMasterItemsBySlugs,
  removeFromInventory,
} from "@/lib/db/inventory";
import { reduceStock, restoreStock } from "@/lib/db/shop";
import {
  SYSTEM_REFUND_NAME,
  SYSTEM_USER_ID_SENTINEL,
} from "@/lib/db/system-actor";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import { findShopItemBySlug, SHOP_CATALOG } from "@/lib/shop/catalog";
import { getShopOpenState } from "@/lib/shop/open-state";
import { ensureDailyStockRefresh } from "@/lib/shop/refresh-stock";

const MIN_QUANTITY = 1;
const MAX_QUANTITY_PER_ITEM = 9;
const MAX_CART_LINES = SHOP_CATALOG.length;

interface CheckoutBody {
  items?: Array<{
    slug?: unknown;
    quantity?: unknown;
  }>;
}

interface CheckoutLine {
  slug: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  itemId: string;
}

function normalizeCartItems(
  rawItems: CheckoutBody["items"],
): Array<{ slug: string; quantity: number }> | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;

  const merged = new Map<string, number>();
  for (const raw of rawItems) {
    const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
    const quantity = raw.quantity;
    if (
      !slug ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < MIN_QUANTITY
    ) {
      return null;
    }
    merged.set(slug, (merged.get(slug) ?? 0) + quantity);
  }

  const items = Array.from(merged, ([slug, quantity]) => ({ slug, quantity }));
  if (items.length === 0 || items.length > MAX_CART_LINES) return null;
  if (items.some((item) => item.quantity > MAX_QUANTITY_PER_ITEM)) return null;
  return items;
}

function formatOrderDescription(lines: CheckoutLine[]): string {
  const [first, ...rest] = lines;
  if (!first) return "편의점 장바구니 구매";
  const suffix = rest.length > 0 ? ` 외 ${rest.length}종` : "";
  return `편의점 장바구니 구매 — ${first.name} x${first.quantity}${suffix}`;
}

async function restoreReducedStock(
  reducedLines: Array<{ slug: string; quantity: number }>,
): Promise<void> {
  await Promise.all(
    reducedLines.map((line) =>
      restoreStock(line.slug, line.quantity).catch((err) => {
        console.error(
          `[shop/checkout] restoreStock 보상 실패 slug=${line.slug} qty=${line.quantity}:`,
          err,
        );
      }),
    ),
  );
}

async function rollbackAddedInventory(
  characterId: string,
  addedLines: Array<{ itemId: string; quantity: number; slug: string }>,
): Promise<void> {
  await Promise.all(
    addedLines.map((line) =>
      removeFromInventory(characterId, line.itemId, line.quantity).catch(
        (err) => {
          console.error(
            `[shop/checkout] inventory rollback 실패 slug=${line.slug} qty=${line.quantity}:`,
            err,
          );
        },
      ),
    ),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  const normalizedItems = normalizeCartItems(body?.items);
  if (!normalizedItems) {
    return NextResponse.json(
      {
        error: `장바구니는 1~${MAX_CART_LINES}개 품목, 품목당 1~${MAX_QUANTITY_PER_ITEM}개까지만 결제할 수 있습니다.`,
        code: "INVALID_CART",
      },
      { status: 400 },
    );
  }

  if (!(await getShopOpenState()).isOpen) {
    return NextResponse.json(
      {
        error: "영업 시간이 아닙니다 (06:00~20:00·일요일 마감).",
        code: "SHOP_CLOSED",
      },
      { status: 400 },
    );
  }

  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
    return NextResponse.json(
      { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
      { status: 409 },
    );
  }
  if (!mainChar) {
    return NextResponse.json(
      {
        error: "메인 AGENT 캐릭터가 등록되어 있지 않아 구매할 수 없습니다.",
        code: "NO_MAIN_CHARACTER",
      },
      { status: 400 },
    );
  }
  if (!mainChar.ownerId) {
    return NextResponse.json(
      { error: "캐릭터에 owner가 연결되어 있지 않습니다 — ledger 발급 불가." },
      { status: 400 },
    );
  }

  const owner = await findUserById(mainChar.ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  await ensureDailyStockRefresh().catch((err) => {
    console.error("[shop/checkout] ensureDailyStockRefresh 실패", err);
  });

  const masterDocs = await findMasterItemsBySlugs(
    normalizedItems.map((item) => item.slug),
  );
  const masterIdBySlug = new Map(
    masterDocs
      .filter((doc) => doc.slug && doc._id)
      .map((doc) => [doc.slug as string, String(doc._id)]),
  );

  const lines: CheckoutLine[] = [];
  for (const item of normalizedItems) {
    const catalogItem = findShopItemBySlug(item.slug);
    const itemId = masterIdBySlug.get(item.slug);
    if (!catalogItem || !itemId) {
      return NextResponse.json(
        {
          error: `편의점 카탈로그 또는 마스터 아이템을 찾을 수 없습니다: ${item.slug}`,
        },
        { status: 400 },
      );
    }
    lines.push({
      slug: item.slug,
      name: catalogItem.name,
      quantity: item.quantity,
      unitPrice: catalogItem.price,
      totalPrice: catalogItem.price * item.quantity,
      itemId,
    });
  }

  const totalPrice = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  const reducedLines: Array<{ slug: string; quantity: number }> = [];
  const addedInventoryLines: Array<{
    itemId: string;
    quantity: number;
    slug: string;
  }> = [];

  for (const line of lines) {
    const stockOk = await reduceStock(line.slug, line.quantity);
    if (!stockOk) {
      await restoreReducedStock(reducedLines);
      return NextResponse.json(
        {
          error: `${line.name} 재고가 부족합니다.`,
          code: "OUT_OF_STOCK",
          slug: line.slug,
        },
        { status: 400 },
      );
    }
    reducedLines.push({ slug: line.slug, quantity: line.quantity });
  }

  let creditTx;
  try {
    creditTx = await addCredit({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: -totalPrice,
      type: "PURCHASE",
      description: formatOrderDescription(lines),
      metadata: {
        source: "shop_checkout",
        itemCount: lines.length,
        itemsJson: JSON.stringify(
          lines.map((line) => ({
            slug: line.slug,
            itemId: line.itemId,
            qty: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.totalPrice,
          })),
        ),
      },
      createdById: session.user.id,
      createdByName: session.user.displayName,
    });
  } catch (err) {
    await restoreReducedStock(reducedLines);
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json(
        { error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "잔액 차감 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    for (const line of lines) {
      await addToInventory({
        characterId: String(mainChar._id),
        characterCodename: mainChar.codename,
        itemId: line.itemId,
        itemName: line.name,
        quantity: line.quantity,
        acquiredAt: new Date(),
      });
      addedInventoryLines.push({
        itemId: line.itemId,
        quantity: line.quantity,
        slug: line.slug,
      });
    }
  } catch (err) {
    await Promise.all([
      restoreReducedStock(reducedLines),
      rollbackAddedInventory(String(mainChar._id), addedInventoryLines),
    ]);

    let refundOk = true;
    await addCredit({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: totalPrice,
      type: "ADMIN_GRANT",
      description: `편의점 장바구니 자동 환불 — ${lines.length}종 (인벤토리 적재 실패)`,
      metadata: {
        source: "shop_checkout_refund",
        reason: "inventory_add_failed",
        originalCreditTxId: String(creditTx._id ?? ""),
        itemCount: lines.length,
        itemsJson: JSON.stringify(
          lines.map((line) => ({
            slug: line.slug,
            itemId: line.itemId,
            qty: line.quantity,
            totalPrice: line.totalPrice,
          })),
        ),
      },
      createdById: SYSTEM_USER_ID_SENTINEL,
      createdByName: SYSTEM_REFUND_NAME,
      allowNegative: true,
    }).catch((refundErr) => {
      console.error(
        `[shop/checkout] CRITICAL 환불 ledger 실패 — 수동 정정 필요 totalPrice=${totalPrice}:`,
        refundErr,
      );
      refundOk = false;
    });

    if (!refundOk) {
      return NextResponse.json(
        {
          error:
            `구매 실패 + 자동 환불 실패. 운영자(GM) 정정 필요. ` +
            `(품목=${lines.length}종, 차감액=${totalPrice})`,
          code: "REFUND_FAILED",
        },
        { status: 500 },
      );
    }

    const message =
      err instanceof Error ? err.message : "인벤토리 적재 실패";
    return NextResponse.json(
      {
        error: `구매 실패 (자동 환불 완료): ${message}`,
        code: "INVENTORY_FAILED_REFUNDED",
      },
      { status: 500 },
    );
  }

  await notifyUser({
    userId: mainChar.ownerId,
    type: "CREDIT_RECEIVED",
    title: "아이템 구매로 크레딧이 사용되었습니다",
    message: [
      `${mainChar.codename} · ${formatOrderDescription(lines)}`,
      formatSignedAmount(-totalPrice, "CR"),
      `현재 잔액 ${creditTx.balance.toLocaleString()} CR`,
    ].join(" · "),
    link: "/erp/shop",
  });

  return NextResponse.json(
    {
      order: {
        items: lines.map((line) => ({
          slug: line.slug,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
        })),
        totalPrice,
      },
      balance: creditTx.balance,
    },
    { status: 201 },
  );
}
