/**
 * POST /api/erp/equipment-shop/checkout — 장비 판매점 장바구니 결제.
 *
 * 장비 카탈로그(WEAPON/ARMOR)의 판매 가능 품목을 구매해 크레딧을 차감하고
 * character_inventory 에 적재한다. 장비점 전용 재고는 아직 없으므로 재고 차감은 하지 않는다.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  addToInventory,
  findMasterItemsBySlugsOrIds,
  removeFromInventory,
} from "@/lib/db/inventory";
import {
  SYSTEM_REFUND_NAME,
  SYSTEM_USER_ID_SENTINEL,
} from "@/lib/db/system-actor";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import {
  isEquipmentShopCategory,
  toEquipmentPriceNumber,
} from "@/lib/equipment-shop/catalog";

const MIN_QUANTITY = 1;
const MAX_QUANTITY_PER_ITEM = 1;
const MAX_CART_LINES = 20;

interface CheckoutBody {
  items?: Array<{
    key?: unknown;
    quantity?: unknown;
  }>;
}

interface CheckoutLine {
  key: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  itemId: string;
}

function normalizeCartItems(
  rawItems: CheckoutBody["items"],
): Array<{ key: string; quantity: number }> | null {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;

  const merged = new Map<string, number>();
  for (const raw of rawItems) {
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    const quantity = raw.quantity;
    if (
      !key ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < MIN_QUANTITY
    ) {
      return null;
    }
    merged.set(key, (merged.get(key) ?? 0) + quantity);
  }

  const items = Array.from(merged, ([key, quantity]) => ({ key, quantity }));
  if (items.length === 0 || items.length > MAX_CART_LINES) return null;
  if (items.some((item) => item.quantity > MAX_QUANTITY_PER_ITEM)) return null;
  return items;
}

function formatOrderDescription(lines: CheckoutLine[]): string {
  const [first, ...rest] = lines;
  if (!first) return "장비 판매점 구매";
  const suffix = rest.length > 0 ? ` 외 ${rest.length}종` : "";
  return `장비 판매점 구매 — ${first.name} x${first.quantity}${suffix}`;
}

async function rollbackAddedInventory(
  characterId: string,
  addedLines: Array<{ itemId: string; quantity: number; key: string }>,
): Promise<void> {
  await Promise.all(
    addedLines.map((line) =>
      removeFromInventory(characterId, line.itemId, line.quantity).catch(
        (err) => {
          console.error(
            `[equipment-shop/checkout] inventory rollback 실패 key=${line.key} qty=${line.quantity}:`,
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
        error: `장비는 1~${MAX_CART_LINES}개 품목, 품목당 1개까지만 결제할 수 있습니다.`,
        code: "INVALID_CART",
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

  // 품목별 단건 조회(findMasterItemBySlugOrId × N)를 단일 $in 쿼리로 대체.
  // key 별 판정은 단건 함수와 동일 — slug 우선, ObjectId hex 폴백.
  const masterItems = await findMasterItemsBySlugsOrIds(
    normalizedItems.map((item) => item.key),
  );
  type ResolvedMasterItem = (typeof masterItems)[number];
  const masterBySlug = new Map<string, ResolvedMasterItem>();
  const masterById = new Map<string, ResolvedMasterItem>();
  for (const masterItem of masterItems) {
    if (masterItem.slug) masterBySlug.set(masterItem.slug, masterItem);
    if (masterItem._id) masterById.set(String(masterItem._id), masterItem);
  }

  const lines: CheckoutLine[] = [];
  for (const item of normalizedItems) {
    const masterItem =
      masterBySlug.get(item.key) ?? masterById.get(item.key) ?? null;
    if (
      !masterItem ||
      !masterItem._id ||
      !isEquipmentShopCategory(masterItem.category) ||
      masterItem.isAvailable === false ||
      masterItem.isPublic === false
    ) {
      return NextResponse.json(
        {
          error: `판매 가능한 장비 카탈로그 품목을 찾을 수 없습니다: ${item.key}`,
          code: "ITEM_NOT_AVAILABLE",
        },
        { status: 400 },
      );
    }

    const unitPrice = toEquipmentPriceNumber(masterItem.price);
    if (unitPrice === null) {
      return NextResponse.json(
        {
          error: `${masterItem.name} 가격이 확정되지 않아 구매할 수 없습니다.`,
          code: "PRICE_NOT_SET",
        },
        { status: 400 },
      );
    }

    lines.push({
      key: item.key,
      name: masterItem.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      itemId: String(masterItem._id),
    });
  }

  const totalPrice = lines.reduce((sum, line) => sum + line.totalPrice, 0);

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
        source: "equipment_shop_checkout",
        itemCount: lines.length,
        itemsJson: JSON.stringify(
          lines.map((line) => ({
            key: line.key,
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
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json(
        { error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "잔액 차감 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const addedInventoryLines: Array<{
    itemId: string;
    quantity: number;
    key: string;
  }> = [];

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
        key: line.key,
      });
    }
  } catch (err) {
    await rollbackAddedInventory(String(mainChar._id), addedInventoryLines);

    let refundOk = true;
    await addCredit({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: totalPrice,
      type: "ADMIN_GRANT",
      description: `장비 판매점 자동 환불 — ${lines.length}종 (인벤토리 적재 실패)`,
      metadata: {
        source: "equipment_shop_checkout_refund",
        reason: "inventory_add_failed",
        originalCreditTxId: String(creditTx._id ?? ""),
        itemCount: lines.length,
        itemsJson: JSON.stringify(
          lines.map((line) => ({
            key: line.key,
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
        `[equipment-shop/checkout] CRITICAL 환불 ledger 실패 — 수동 정정 필요 totalPrice=${totalPrice}:`,
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
    title: "장비 구매로 크레딧이 사용되었습니다",
    message: [
      `${mainChar.codename} · ${formatOrderDescription(lines)}`,
      formatSignedAmount(-totalPrice, "CR"),
      `현재 잔액 ${creditTx.balance.toLocaleString()} CR`,
    ].join(" · "),
    link: "/erp/equipment-shop",
  });

  return NextResponse.json(
    {
      order: {
        items: lines.map((line) => ({
          key: line.key,
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
