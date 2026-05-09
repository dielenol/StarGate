/**
 * POST /api/erp/shop/buy — 편의점 구매 (재고 차감 + 잔액 차감 + 인벤토리 적재).
 *
 * 트랜잭션 정책 — **보상(Saga) 패턴** (mongo session 미도입):
 * - 본 라우트는 3단계 (reduceStock → addCredit → addToInventory) 가 모두 성공해야 정상.
 * - 후속 단계 실패 시 이전 단계를 best-effort 보상 (`restoreStock` / 환불 ledger entry).
 * - mongo session 미사용 이유:
 *   1) `addCredit` 은 read-latest-balance + insertOne 구조라 transaction 으로 묶어도
 *      ledger 자체의 race window 가 별도로 있음 (Phase 2 후속 mongo transaction 과제).
 *   2) 기존 credits/inventory 라우트가 모두 동일 보상 패턴 (단일 봇 + 낮은 mutation 빈도 환경).
 *   3) Saga 단계가 3개 뿐이고 각 단계가 명확하게 보상 가능 → 운영 모니터링으로 충분.
 * - 보상 실패는 console.error 로 로깅 (운영자 알람 → 수동 정정).
 *
 * 본인 메인 캐릭에 한해 구매 가능. 1회 quantity 1~9 (tia_bot 동일).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import {
  addToInventory,
  findMasterItemBySlug,
} from "@/lib/db/inventory";
import { reduceStock, restoreStock } from "@/lib/db/shop";
import {
  SYSTEM_REFUND_NAME,
  SYSTEM_USER_ID_SENTINEL,
} from "@/lib/db/system-actor";
import { findUserById } from "@/lib/db/users";
import { findShopItemBySlug, isShopOpen } from "@/lib/shop/catalog";

/* ── 상수 ── */

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 9;

/* ── 타입 ── */

interface BuyBody {
  slug?: string;
  quantity?: number;
}

interface BuyResponse {
  purchase: {
    slug: string;
    name: string;
    quantity: number;
    totalPrice: number;
  };
  balance: number;
}

/* ── 핸들러 ── */

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as BuyBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const slug = body.slug?.trim();
  const quantity = body.quantity;

  // slug 검증 — SHOP_CATALOG 존재.
  if (!slug) {
    return NextResponse.json(
      { error: "slug는 필수입니다." },
      { status: 400 },
    );
  }
  const catalogItem = findShopItemBySlug(slug);
  if (!catalogItem) {
    return NextResponse.json(
      { error: "편의점 카탈로그에 없는 아이템입니다." },
      { status: 400 },
    );
  }

  // quantity 검증 — 1~9 정수.
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < MIN_QUANTITY ||
    quantity > MAX_QUANTITY
  ) {
    return NextResponse.json(
      {
        error: `quantity는 ${MIN_QUANTITY}~${MAX_QUANTITY} 사이의 정수여야 합니다.`,
      },
      { status: 400 },
    );
  }

  // 영업시간 가드.
  if (!isShopOpen(new Date())) {
    return NextResponse.json(
      {
        error: "영업 시간이 아닙니다 (토 18시 이후·일요일 마감).",
        code: "SHOP_CLOSED",
      },
      { status: 400 },
    );
  }

  // 메인 캐릭터 가드.
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

  // owner 비정규화 정보 (ownerName) — credits 라우트와 일관.
  const owner = await findUserById(mainChar.ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  // master_items lookup — slug → _id (character_inventory.itemId 가 ObjectId hex 형식).
  const masterItem = await findMasterItemBySlug(slug);
  if (!masterItem || !masterItem._id) {
    return NextResponse.json(
      {
        error:
          "마스터 아이템 시드가 없습니다 (운영자에게 seed:shop 실행을 요청하세요).",
      },
      { status: 500 },
    );
  }
  const itemId = String(masterItem._id);

  // catalog price 와 master price 가 다를 수 있으나 본 라우트는 catalog 를 SoT 로 한다
  // (catalog 가 운영중 변동 시 master 보다 빨리 반영). master.price 는 GM 인벤토리 지급용 메타.
  const totalPrice = catalogItem.price * quantity;

  /* ── Saga: reduceStock → addCredit → addToInventory ── */

  // Step 1: 재고 차감 — atomic. 실패 시 보상 불필요 (상태 미변).
  const stockOk = await reduceStock(slug, quantity);
  if (!stockOk) {
    return NextResponse.json(
      { error: "재고가 부족합니다.", code: "OUT_OF_STOCK" },
      { status: 400 },
    );
  }

  // Step 2: 잔액 차감 — 음수 잔액 거부 (allowNegative:false 기본).
  let creditTx;
  try {
    creditTx = await addCredit({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: -totalPrice,
      type: "PURCHASE",
      description: `편의점 구매 — ${catalogItem.name} x${quantity}`,
      metadata: { itemId, qty: quantity, slug },
      createdById: session.user.id,
      createdByName: session.user.displayName,
    });
  } catch (err) {
    // Step 1 보상.
    await restoreStock(slug, quantity).catch((restoreErr) => {
      console.error(
        `[shop/buy] restoreStock 보상 실패 (slug=${slug}, qty=${quantity}): `,
        restoreErr,
      );
    });

    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json(
        { error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "잔액 차감 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Step 3: 인벤토리 적재 — upsert + $inc.
  try {
    await addToInventory({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      itemId,
      itemName: catalogItem.name,
      quantity,
      acquiredAt: new Date(),
    });
  } catch (err) {
    // Step 1 + Step 2 보상.
    await restoreStock(slug, quantity).catch((restoreErr) => {
      console.error(
        `[shop/buy] restoreStock 보상 실패 (slug=${slug}, qty=${quantity}, ` +
          `creditTxId=${String(creditTx._id ?? "?")}): `,
        restoreErr,
      );
    });

    // 환불 ledger — 실패 시 응답 코드 분리 (REFUND_FAILED).
    // TODO(M3-B): 보상 환불 type 을 SYSTEM_REFUND 로 분리 (ADMIN_GRANT 와 ledger 분류 구분).
    let refundOk = true;
    await addCredit({
      characterId: String(mainChar._id),
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: totalPrice,
      type: "ADMIN_GRANT",
      description: `편의점 구매 자동 환불 — ${catalogItem.name} x${quantity} (인벤토리 적재 실패)`,
      metadata: {
        reason: "inventory_add_failed",
        slug,
        qty: quantity,
        originalCreditTxId: String(creditTx._id ?? ""),
      },
      createdById: SYSTEM_USER_ID_SENTINEL,
      createdByName: SYSTEM_REFUND_NAME,
      // 환불은 항상 통과해야 함 — race / 음수 잔액 방어.
      allowNegative: true,
    }).catch((refundErr) => {
      console.error(
        `[shop/buy] CRITICAL 환불 ledger 실패 — 수동 정정 필요 ` +
          `(slug=${slug}, qty=${quantity}, totalPrice=${totalPrice}, ` +
          `characterId=${String(mainChar._id)}): `,
        refundErr,
      );
      refundOk = false;
    });

    if (!refundOk) {
      return NextResponse.json(
        {
          error:
            `구매 실패 + 자동 환불 실패. 운영자(GM) 정정 필요. ` +
            `(slug=${slug}, qty=${quantity}, 차감액=${totalPrice})`,
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

  const response: BuyResponse = {
    purchase: {
      slug,
      name: catalogItem.name,
      quantity,
      totalPrice,
    },
    balance: creditTx.balance,
  };
  return NextResponse.json(response, { status: 201 });
}
