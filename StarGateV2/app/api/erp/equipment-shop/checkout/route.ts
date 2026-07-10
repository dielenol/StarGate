/**
 * POST /api/erp/equipment-shop/checkout — 병기부 장바구니 결제.
 *
 * 병기부 카탈로그의 판매 가능 품목을 구매해 크레딧을 차감하고
 * character_inventory 에 적재한다. 병기부 전용 재고는 아직 없으므로 재고 차감은 하지 않는다.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { childIdempotencyKey, readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { hasOwnedTowaskiLicense } from "@/lib/db/equipment-licenses";
import {
  addToInventory,
  findMasterItemsBySlugsOrIds,
  listCharacterInventory,
  lockCharacterInventoryItems,
  prepareCharacterInventoryItemLocks,
} from "@/lib/db/inventory";
import { findUserById } from "@/lib/db/users";
import { getEquipmentResearchCapabilities } from "@/lib/db/equipment-research";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import {
  equipmentShopItemZone,
  toEquipmentPriceNumber,
} from "@/lib/equipment-shop/catalog";
import { containsDuplicateEquipmentItemIds } from "@/lib/equipment-shop/checkout-lines";
import {
  getEquipmentLicenseRequirement,
  isTowaskiLicenseSlug,
  resolveEquipmentLicenseStatus,
  type EquipmentLicenseRequirement,
} from "@/lib/equipment-shop/licenses";
import { TOWASKI_BASIC_FIREARM_LICENSE_SLUG } from "@/lib/equipment-shop/license-test";

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
  slug?: string;
  licenseRequirement?: EquipmentLicenseRequirement;
}

class EquipmentLicenseAlreadyOwnedError extends Error {
  constructor(readonly licenseName: string) {
    super(`이미 보유한 라이선스입니다: ${licenseName}`);
    this.name = "EquipmentLicenseAlreadyOwnedError";
  }
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
  if (!first) return "병기부 구매";
  const suffix = rest.length > 0 ? ` 외 ${rest.length}종` : "";
  return `병기부 구매 — ${first.name} x${first.quantity}${suffix}`;
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
  const isGM = hasRole(session.user.role, "GM");

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
  const ownerId = mainChar.ownerId;

  if (
    !isGM &&
    !(await hasOwnedTowaskiLicense(
      String(mainChar._id),
      TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    ))
  ) {
    return NextResponse.json(
      {
        error: "토와스키 기본 화기 자격시험을 먼저 통과해야 합니다.",
        code: "BASIC_LICENSE_REQUIRED",
      },
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
    const zone = masterItem ? equipmentShopItemZone(masterItem) : null;
    if (
      !masterItem ||
      !masterItem._id ||
      !zone ||
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

    if (!isGM && zone !== "towaski") {
      return NextResponse.json(
        {
          error: "플레이어 반출은 토와스키 건샵 품목으로 제한됩니다.",
          code: "FORBIDDEN_EQUIPMENT_ZONE",
        },
        { status: 403 },
      );
    }

    if (masterItem.slug === TOWASKI_BASIC_FIREARM_LICENSE_SLUG) {
      return NextResponse.json(
        {
          error: "기본 화기 라이선스는 사격 자격시험 합격 시에만 발급됩니다.",
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

    const licenseRequirement = getEquipmentLicenseRequirement(masterItem);
    lines.push({
      key: item.key,
      name: masterItem.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      itemId: String(masterItem._id),
      ...(masterItem.slug ? { slug: masterItem.slug } : {}),
      ...(licenseRequirement ? { licenseRequirement } : {}),
    });
  }

  if (containsDuplicateEquipmentItemIds(lines.map((line) => line.itemId))) {
    return NextResponse.json(
      {
        error: "동일 장비를 slug와 ID로 중복 요청할 수 없습니다.",
        code: "INVALID_CART",
      },
      { status: 400 },
    );
  }

  const cartLicenseSlugs = new Set(
    lines
      .map((line) => line.slug)
      .filter((slug): slug is string => typeof slug === "string")
      .filter(isTowaskiLicenseSlug),
  );
  const purchasedLicenseLines = lines.filter(
    (line): line is CheckoutLine & { slug: string } =>
      isTowaskiLicenseSlug(line.slug),
  );
  const licenseGatedLines = lines.filter(
    (line): line is CheckoutLine & { licenseRequirement: EquipmentLicenseRequirement } =>
      Boolean(line.licenseRequirement),
  );
  if (licenseGatedLines.length > 0) {
    const inventory = await listCharacterInventory(String(mainChar._id));
    const inventoryMasterItems = await findMasterItemsBySlugsOrIds(
      inventory
        .filter((entry) => entry.quantity > 0)
        .map((entry) => entry.itemId),
    );
    const ownedLicenseSlugs = new Set(
      inventoryMasterItems
        .map((item) => item.slug)
        .filter((slug): slug is string => typeof slug === "string")
        .filter(isTowaskiLicenseSlug),
    );

    for (const line of licenseGatedLines) {
      const licenseStatus = resolveEquipmentLicenseStatus({
        character: mainChar,
        requirement: line.licenseRequirement,
        ownedLicenseSlugs,
        cartLicenseSlugs,
      });
      if (!licenseStatus.satisfied) {
        return NextResponse.json(
          {
            error:
              `${line.name} 반출에는 ${line.licenseRequirement.licenseName}이 필요합니다. ` +
              `${line.licenseRequirement.reason} 자격이 캐릭터 특성/특전/무기 훈련에 없으면 ` +
              `토와스키 라이센스 탭에서 먼저 구매하세요.`,
            code: "LICENSE_REQUIRED",
          },
          { status: 400 },
        );
      }
    }
  }

  const totalPrice = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  const characterId = String(mainChar._id);
  const capabilities = await getEquipmentResearchCapabilities(String(mainChar._id));
  const quotedRefund = capabilities.refundPercent > 0
    ? Math.min(capabilities.refundCap, Math.floor((totalPrice * capabilities.refundPercent) / 100))
    : 0;
  const committed: { notification: { balance: number; refund: number } | null } = {
    notification: null,
  };

  let response: NextResponse;
  try {
    await prepareCharacterInventoryItemLocks(
      characterId,
      lines.map((line) => line.itemId),
    );
    response = await executeEconomicOperation({
      requestId,
      domain: "equipment-shop-checkout",
      actorId: session.user.id,
      payload: { items: normalizedItems },
      run: async (mongoSession) => {
        await lockCharacterInventoryItems(
          characterId,
          lines.map((line) => line.itemId),
          mongoSession,
        );

        if (purchasedLicenseLines.length > 0) {
          const inventory = await listCharacterInventory(characterId, {
            session: mongoSession,
          });
          const ownedItemIds = new Set(
            inventory
              .filter((entry) => entry.quantity > 0)
              .map((entry) => entry.itemId),
          );
          const alreadyOwned = purchasedLicenseLines.find((line) =>
            ownedItemIds.has(line.itemId),
          );
          if (alreadyOwned) {
            throw new EquipmentLicenseAlreadyOwnedError(alreadyOwned.name);
          }
        }

        const debit = await addCredit({
          characterId,
          characterCodename: mainChar.codename,
          ownerId,
          ownerName,
          amount: -totalPrice,
          type: "PURCHASE",
          description: formatOrderDescription(lines),
          metadata: { source: "equipment_shop_checkout", itemCount: lines.length },
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
        let balance = debit.balance;
        let actualRefund = 0;
        if (quotedRefund > 0) {
          const refund = await addCredit({
            characterId: String(mainChar._id),
            characterCodename: mainChar.codename,
            ownerId,
            ownerName,
            amount: quotedRefund,
            type: "ADMIN_GRANT",
            description: `병기부 연구 환급 — ${capabilities.refundPercent}%`,
            metadata: { source: "equipment_shop_research_refund", totalPrice },
            createdById: session.user.id,
            createdByName: session.user.displayName,
            requestId: childIdempotencyKey(requestId, "research-refund"),
            allowNegative: true,
            session: mongoSession,
          });
          balance = refund.balance;
          actualRefund = quotedRefund;
        }
        committed.notification = { balance, refund: actualRefund };
        return {
          status: 201,
          body: {
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
            balance,
            researchRefund: actualRefund,
          },
        };
      },
    });
  } catch (err) {
    if (err instanceof EquipmentLicenseAlreadyOwnedError) {
      return NextResponse.json(
        {
          error: `${err.licenseName}은 이미 보유 중입니다. 장바구니에서 제거해 주세요.`,
          code: "LICENSE_ALREADY_OWNED",
        },
        { status: 409 },
      );
    }
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json(
        { error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "결제 실패", code: "CHECKOUT_TRANSACTION_FAILED" },
      { status: 500 },
    );
  }

  if (committed.notification) {
    const { balance, refund } = committed.notification;
    void notifyUser({
      userId: ownerId,
      type: "CREDIT_RECEIVED",
      title: "병기부 구매로 크레딧이 사용되었습니다",
      message: [
        `${mainChar.codename} · ${formatOrderDescription(lines)}`,
        formatSignedAmount(-totalPrice, "CR"),
        refund > 0 ? `연구 환급 +${refund.toLocaleString()} CR` : "",
        `현재 잔액 ${balance.toLocaleString()} CR`,
      ].filter(Boolean).join(" · "),
      link: "/erp/equipment-shop/towaski",
    }).catch((error) => console.error("[equipment-shop/checkout] notification failed", error));
  }
  return response;
}
