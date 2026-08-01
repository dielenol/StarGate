/**
 * POST /api/erp/shop/checkout — 편의점 장바구니 결제.
 *
 * 여러 품목을 하나의 주문으로 검증하고, 총액을 한 번 차감한 뒤 인벤토리에 적재한다.
 * 크레딧·재고·인벤토리·멱등 응답을 하나의 Mongo transaction으로 커밋한다.
 */

import { NextResponse } from "next/server";

import {
  isMrBeastSodaStockImpactPurchaseEligible,
  resolveMrBeastSodaStockImpactWindow,
} from "@stargate/core/domain/mrbeast-soda-stock-impact";

import { auth } from "@/lib/auth/config";
import { resolvePlayerServiceAvailability } from "@/lib/auth/player-service-test-access";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  addToInventory,
  findMasterItemBySlug,
  findMasterItemsBySlugs,
  lockCharacterInventoryItems,
  prepareCharacterInventoryItemLocks,
} from "@/lib/db/inventory";
import {
  assertMrBeastLotteryIndexesReady,
  fenceActiveMrBeastLotteryConfigForGrant,
  fenceLotteryCharacterOwner,
  grantMrBeastLotteryTicketsForPurchase,
  getMrBeastLotteryConfig,
  isMrBeastLotteryTicketMasterReady,
  MrBeastLotteryError,
} from "@/lib/db/mrbeast-lottery";
import {
  incrementMrBeastSodaDailyPurchaseCounter,
  prepareMrBeastSodaDailyPurchaseCounter,
} from "@/lib/db/mrbeast-soda-daily-limit";
import {
  incrementMrBeastSodaStockImpactDemand,
  prepareMrBeastSodaStockImpactDemand,
  MrBeastSodaStockImpactDemandError,
} from "@/lib/db/mrbeast-soda-stock-impact";
import { reduceStock } from "@/lib/db/shop";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import {
  MRBEAST_LOTTERY_SLUG,
  MRBEAST_SODA_SLUG,
} from "@/lib/shop/mrbeast-lottery";
import {
  createMrBeastSodaDailyPurchaseKey,
  MRBEAST_SODA_DAILY_PURCHASE_LIMIT,
  MrBeastSodaDailyLimitError,
} from "@/lib/shop/mrbeast-soda-daily-limit";
import { getShopOpenState } from "@/lib/shop/open-state";
import { ensureDailyStockRefresh } from "@/lib/shop/refresh-stock";
import { loadRuntimeShopCatalog } from "@/lib/shop/runtime-catalog";
import { recordShopStockAuditLog } from "@/lib/shop/stock-audit";

const MIN_QUANTITY = 1;
const MAX_QUANTITY_PER_ITEM = 9;

interface CheckoutBody {
  items?: Array<{
    slug?: unknown;
    quantity?: unknown;
  }>;
  expectsLotteryTickets?: unknown;
}

interface CheckoutLine {
  slug: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  itemId: string;
}

class ShopLotteryStateChangedError extends Error {
  constructor() {
    super(
      "복권 이벤트가 종료되어 소다 결제를 중단했습니다. 이벤트 상태를 새로 확인해 주세요.",
    );
    this.name = "ShopLotteryStateChangedError";
  }
}

function normalizeCartItems(
  rawItems: CheckoutBody["items"],
  maxCartLines: number,
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
  if (items.length === 0 || items.length > maxCartLines) return null;
  if (items.some((item) => item.quantity > MAX_QUANTITY_PER_ITEM)) return null;
  return items;
}

function formatOrderDescription(lines: CheckoutLine[]): string {
  const [first, ...rest] = lines;
  if (!first) return "편의점 장바구니 구매";
  const suffix = rest.length > 0 ? ` 외 ${rest.length}종` : "";
  return `편의점 장바구니 구매 — ${first.name} x${first.quantity}${suffix}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  let catalog;
  try {
    catalog = await loadRuntimeShopCatalog();
  } catch (error) {
    console.error("[shop/checkout] runtime catalog load failed", error);
    return NextResponse.json(
      { error: "편의점 카탈로그를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
  const normalizedItems = normalizeCartItems(body?.items, catalog.length);
  if (!normalizedItems) {
    return NextResponse.json(
      {
        error: `장바구니는 1~${catalog.length}개 품목, 품목당 1~${MAX_QUANTITY_PER_ITEM}개까지만 결제할 수 있습니다.`,
        code: "INVALID_CART",
      },
      { status: 400 },
    );
  }

  const shopOpen = (await getShopOpenState()).isOpen;
  if (!resolvePlayerServiceAvailability(shopOpen, session.user)) {
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
  const ownerId = mainChar.ownerId;
  if (ownerId !== session.user.id) {
    return NextResponse.json(
      { error: "캐릭터 owner 연결이 현재 사용자와 일치하지 않습니다." },
      { status: 403 },
    );
  }

  const owner = await findUserById(ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  await ensureDailyStockRefresh(new Date(), { catalog }).catch((err) => {
    console.error("[shop/checkout] ensureDailyStockRefresh 실패", err);
  });

  const lotteryConfig = await getMrBeastLotteryConfig();
  const checkoutStartedAt = new Date();
  const expectsLotteryTickets = body?.expectsLotteryTickets === true;
  const sodaDailyPurchaseQuantity =
    normalizedItems.find((item) => item.slug === MRBEAST_SODA_SLUG)
      ?.quantity ?? 0;
  const sodaDailyPurchaseKey =
    sodaDailyPurchaseQuantity > 0
      ? createMrBeastSodaDailyPurchaseKey({
          userId: session.user.id,
          slug: MRBEAST_SODA_SLUG,
        })
      : null;
  const sodaStockImpactWindow = resolveMrBeastSodaStockImpactWindow({
    eventId: lotteryConfig.eventId,
    configVersion: lotteryConfig.version,
    startAt: lotteryConfig.startAt,
    endAt: lotteryConfig.endAt,
  });
  const sodaStockImpactKey =
    sodaDailyPurchaseQuantity > 0 &&
    lotteryConfig.active &&
    sodaStockImpactWindow &&
    isMrBeastSodaStockImpactPurchaseEligible(
      sodaStockImpactWindow,
      checkoutStartedAt,
    )
      ? {
          eventId: sodaStockImpactWindow.eventId,
          configVersion: sodaStockImpactWindow.configVersion,
          startAt: sodaStockImpactWindow.startAt,
          endAt: sodaStockImpactWindow.endAt,
        }
      : null;
  const lotteryTicketQuantity = lotteryConfig.active
    ? sodaDailyPurchaseQuantity
    : 0;
  if (lotteryTicketQuantity > 0) {
    try {
      await assertMrBeastLotteryIndexesReady();
    } catch (error) {
      if (error instanceof MrBeastLotteryError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 503 },
        );
      }
      console.error("[shop/checkout] lottery readiness failed", error);
      return NextResponse.json(
        {
          error: "복권 이벤트 준비 상태를 확인할 수 없습니다.",
          code: "LOTTERY_MISCONFIGURED",
        },
        { status: 503 },
      );
    }
  }
  const masterLookupSlugs = [
    ...normalizedItems.map((item) => item.slug),
    ...(lotteryTicketQuantity > 0 ? [MRBEAST_LOTTERY_SLUG] : []),
  ];
  const [masterDocs, lotteryTicketMaster] = await Promise.all([
    findMasterItemsBySlugs(masterLookupSlugs),
    lotteryTicketQuantity > 0
      ? findMasterItemBySlug(MRBEAST_LOTTERY_SLUG)
      : Promise.resolve(null),
  ]);
  const masterIdBySlug = new Map(
    masterDocs
      .filter((doc) => doc.slug && doc._id)
      .map((doc) => [doc.slug as string, String(doc._id)]),
  );
  const lotteryTicketItemId = masterIdBySlug.get(MRBEAST_LOTTERY_SLUG);
  if (
    lotteryTicketQuantity > 0 &&
    (!lotteryTicketItemId ||
      !isMrBeastLotteryTicketMasterReady(lotteryTicketMaster))
  ) {
    return NextResponse.json(
      {
        error:
          "복권 마스터 아이템 설정이 누락되었거나 안전 조건과 다릅니다.",
        code: "LOTTERY_MISCONFIGURED",
      },
      { status: 503 },
    );
  }
  const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));

  const lines: CheckoutLine[] = [];
  for (const item of normalizedItems) {
    const catalogItem = catalogBySlug.get(item.slug);
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
  if (!Number.isSafeInteger(totalPrice) || totalPrice < 1) {
    return NextResponse.json(
      {
        error: "장바구니 합계가 허용 범위를 벗어났습니다.",
        code: "INVALID_CART",
      },
      { status: 400 },
    );
  }
  const characterId = String(mainChar._id);
  const inventoryLockItemIds = [
    ...lines.map((line) => line.itemId),
    ...(lotteryTicketItemId ? [lotteryTicketItemId] : []),
  ];
  const committed: { balance: number | null } = { balance: null };
  let response: NextResponse;
  try {
    if (sodaDailyPurchaseKey) {
      await prepareMrBeastSodaDailyPurchaseCounter(sodaDailyPurchaseKey);
    }
    if (sodaStockImpactKey) {
      await prepareMrBeastSodaStockImpactDemand(sodaStockImpactKey);
    }
    await prepareCharacterInventoryItemLocks(
      characterId,
      inventoryLockItemIds,
    );
    response = await executeEconomicOperation({
      requestId,
      domain: "shop-checkout",
      actorId: session.user.id,
      payload: {
        items: normalizedItems,
        ...(expectsLotteryTickets ? { expectsLotteryTickets: true } : {}),
      },
      run: async (mongoSession) => {
        const committedAt = new Date();
        const lotteryConfigAtCommit =
          lotteryTicketQuantity > 0
            ? await fenceActiveMrBeastLotteryConfigForGrant({
                expectedEventId: lotteryConfig.eventId ?? "",
                expectedVersion: lotteryConfig.version,
                now: committedAt,
                session: mongoSession,
              })
            : lotteryConfig;
        const lotteryEventUnchanged =
          lotteryConfigAtCommit !== null &&
          lotteryConfigAtCommit.active &&
          lotteryConfigAtCommit.eventId === lotteryConfig.eventId;
        if (
          expectsLotteryTickets &&
          sodaDailyPurchaseQuantity > 0 &&
          !lotteryEventUnchanged
        ) {
          throw new ShopLotteryStateChangedError();
        }
        await fenceLotteryCharacterOwner({
          characterId,
          ownerId: session.user.id,
          session: mongoSession,
        });
        if (sodaDailyPurchaseKey) {
          await incrementMrBeastSodaDailyPurchaseCounter({
            key: sodaDailyPurchaseKey,
            quantity: sodaDailyPurchaseQuantity,
            session: mongoSession,
          });
        }
        if (
          sodaStockImpactKey &&
          sodaStockImpactWindow &&
          lotteryEventUnchanged &&
          isMrBeastSodaStockImpactPurchaseEligible(
            sodaStockImpactWindow,
            committedAt,
          )
        ) {
          await incrementMrBeastSodaStockImpactDemand({
            key: sodaStockImpactKey,
            quantity: sodaDailyPurchaseQuantity,
            purchasedAt: committedAt,
            session: mongoSession,
          });
        }
        await lockCharacterInventoryItems(
          characterId,
          inventoryLockItemIds,
          mongoSession,
        );
        for (const line of lines) {
          const ok = await reduceStock(line.slug, line.quantity, { session: mongoSession });
          if (!ok) throw new Error(`OUT_OF_STOCK:${line.slug}`);
        }
        const debit = await addCredit({
          characterId,
          characterCodename: mainChar.codename,
          ownerId,
          ownerName,
          amount: -totalPrice,
          type: "PURCHASE",
          description: formatOrderDescription(lines),
          metadata: { source: "shop_checkout", itemCount: lines.length },
          createdById: session.user.id,
          createdByName: session.user.displayName,
          requestId,
          session: mongoSession,
        });
        for (const line of lines) {
          await addToInventory(
            {
              characterId,
              characterCodename: mainChar.codename,
              itemId: line.itemId,
              itemName: line.name,
              quantity: line.quantity,
              acquiredAt: new Date(),
            },
            { session: mongoSession },
          );
        }
        const lotteryTicketsGranted =
          await grantMrBeastLotteryTicketsForPurchase({
            config: {
              ...(lotteryConfigAtCommit ?? lotteryConfig),
              active: lotteryEventUnchanged,
            },
            characterId,
            characterCodename: mainChar.codename,
            ticketItemId: lotteryTicketItemId ?? "",
            sourceRequestId: requestId,
            quantity: lotteryEventUnchanged ? lotteryTicketQuantity : 0,
            acquiredAt: new Date(),
            session: mongoSession,
          });
        committed.balance = debit.balance;
        return {
          status: 201,
          body: {
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
            balance: debit.balance,
            lotteryTicketsGranted,
          },
        };
      },
    });
  } catch (err) {
    if (err instanceof ShopLotteryStateChangedError) {
      return NextResponse.json(
        { error: err.message, code: "LOTTERY_DISABLED" },
        { status: 409 },
      );
    }
    if (err instanceof MrBeastSodaDailyLimitError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          limit: MRBEAST_SODA_DAILY_PURCHASE_LIMIT,
        },
        { status: 400 },
      );
    }
    if (err instanceof MrBeastSodaStockImpactDemandError) {
      console.error("[shop/checkout] stock impact demand failed", err);
      return NextResponse.json(
        {
          error:
            "스타마트 판매량 연동을 기록할 수 없어 결제를 중단했습니다. 잠시 후 다시 시도해 주세요.",
          code: "STOCK_IMPACT_UNAVAILABLE",
        },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "결제 실패";
    if (message.startsWith("OUT_OF_STOCK:")) {
      const slug = message.slice("OUT_OF_STOCK:".length);
      return NextResponse.json({ error: "재고가 부족합니다.", code: "OUT_OF_STOCK", slug }, { status: 400 });
    }
    if (message.includes("음수 잔액")) {
      return NextResponse.json({ error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    console.error("[shop/checkout] transaction failed", err);
    return NextResponse.json(
      {
        error: "결제를 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        code: "CHECKOUT_TRANSACTION_FAILED",
      },
      { status: 500 },
    );
  }

  if (committed.balance !== null) {
    for (const line of lines) {
      void recordShopStockAuditLog({
        action: "CHECKOUT_REDUCE",
        itemSlug: line.slug,
        itemName: line.name,
        delta: -line.quantity,
        actorId: session.user.id,
        actorName: session.user.displayName,
        actorType: "USER",
        source: "shop_checkout",
      });
    }
    void notifyUser({
      userId: ownerId,
      type: "CREDIT_RECEIVED",
      title: "아이템 구매로 크레딧이 사용되었습니다",
      message: [
        `${mainChar.codename} · ${formatOrderDescription(lines)}`,
        formatSignedAmount(-totalPrice, "CR"),
        `현재 잔액 ${committed.balance.toLocaleString()} CR`,
      ].join(" · "),
      link: "/erp/shop",
    }).catch((error) => console.error("[shop/checkout] notification failed", error));
  }
  return response;
}
