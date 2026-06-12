/**
 * POST /api/erp/stocks/buy — 주식 매수 (시세 조회 + 잔액 차감 + 보유 적재).
 *
 * 트랜잭션 정책 — **보상(Saga) 패턴** (mongo session 미도입, shop/buy 와 동일):
 * - 본 라우트는 3 단계 (getStockPrice → addCredit → buyHolding) 가 모두 성공해야 정상.
 * - 후속 단계 실패 시 이전 단계를 best-effort 보상 (잔액 환불 ledger).
 * - mongo session 미사용 이유는 shop/buy 와 동일 (단일 봇 + 낮은 mutation 빈도).
 * - 보상 실패는 console.error 로 로깅 (운영자 알람 → 수동 정정).
 *
 * 본인 메인 캐릭에 한해 매수 가능. 1회 shares 1~50 (tia_bot 동일).
 * 즉시 체결. 가격 변동은 본 라우트와 무관 (M3-A 시점에서는 봇 중지로 가격 변동 없음).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { buyHolding, getStockPrice } from "@/lib/db/stocks";
import {
  SYSTEM_REFUND_NAME,
  SYSTEM_USER_ID_SENTINEL,
} from "@/lib/db/system-actor";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import { isStockMarketEnabled } from "@/lib/stocks/market";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";

/* ── 상수 ── */

const MIN_SHARES = 1;
const MAX_SHARES = 50;

/* ── 타입 ── */

interface BuyBody {
  ticker?: string;
  shares?: number;
}

interface BuyResponse {
  purchase: {
    ticker: string;
    name: string;
    shares: number;
    price: number;
    totalCost: number;
  };
  balance: number;
  newHolding: {
    shares: number;
    avgPrice: number;
  };
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

  if (!isStockMarketEnabled()) {
    return NextResponse.json(
      { error: "현재 주식 거래가 일시 중지되어 있습니다.", code: "MARKET_CLOSED" },
      { status: 423 },
    );
  }

  const ticker = body.ticker?.trim().toUpperCase();
  const shares = body.shares;

  // ticker 검증.
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker는 필수입니다." },
      { status: 400 },
    );
  }
  const catalogItem = findStockByTicker(ticker);
  if (!catalogItem) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }

  // shares 검증 — 1~50 정수.
  if (
    typeof shares !== "number" ||
    !Number.isInteger(shares) ||
    shares < MIN_SHARES ||
    shares > MAX_SHARES
  ) {
    return NextResponse.json(
      {
        error: `shares는 ${MIN_SHARES}~${MAX_SHARES} 사이의 정수여야 합니다.`,
      },
      { status: 400 },
    );
  }

  // 메인 캐릭터 가드.
  // findMainCharacterByOwner throw 메시지에 메인 후보 codename 들이 평문 포함될 수
  // 있어 그대로 응답에 노출하면 누설. 운영 채널(Vercel 로그)에만 원본을 남기고
  // 사용자에게는 일반화된 메시지만 반환 — page.tsx 와 동일 정책.
  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    console.error(
      `[stocks/buy] findMainCharacterByOwner integrity violation (userId=${session.user.id}): `,
      err,
    );
    return NextResponse.json(
      {
        error: "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의해주세요.",
        code: "MAIN_CHARACTER_INTEGRITY",
      },
      { status: 409 },
    );
  }
  if (!mainChar) {
    return NextResponse.json(
      {
        error: "메인 AGENT 캐릭터가 등록되어 있지 않아 매수할 수 없습니다.",
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

  // owner 비정규화 (ownerName) — credits/shop 라우트와 일관.
  const owner = await findUserById(mainChar.ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  /* ── Saga: getStockPrice → addCredit → buyHolding ── */

  // Step 1: 시세 조회 — 시드 미적재 종목 거부 (운영자 안내 코드).
  const priceDoc = await getStockPrice(ticker);
  if (!priceDoc) {
    return NextResponse.json(
      {
        error:
          "주식 시세 시드가 없습니다 (운영자에게 seed:stocks 실행을 요청하세요).",
        code: "PRICE_NOT_FOUND",
      },
      { status: 500 },
    );
  }
  const price = priceDoc.price;
  const totalCost = roundStockValue(price * shares);

  const characterId = String(mainChar._id);

  // Step 2: 잔액 차감 — 음수 잔액 거부 (allowNegative:false 기본).
  let creditTx;
  try {
    creditTx = await addCredit({
      characterId,
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: -totalCost,
      type: "STOCK_BUY",
      description: `주식 매수 — ${catalogItem.name} ${shares}주 @${price}¤`,
      metadata: { ticker, shares, price },
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

  // Step 3: 보유 적재 — atomic upsert + 가중평균 갱신.
  let newHolding;
  try {
    newHolding = await buyHolding(characterId, ticker, shares, price);
  } catch (err) {
    // Step 2 보상 — 환불 ledger.
    // TODO(M3-B): 보상 환불 type 을 SYSTEM_REFUND 로 분리 (ADMIN_GRANT 와 ledger 분류 구분).
    let refundOk = true;
    await addCredit({
      characterId,
      characterCodename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName,
      amount: totalCost,
      type: "ADMIN_GRANT",
      description: `주식 매수 자동 환불 — ${catalogItem.name} ${shares}주 @${price}¤ (포지션 적재 실패)`,
      metadata: {
        reason: "holding_buy_failed",
        ticker,
        shares,
        price,
        originalCreditTxId: String(creditTx._id ?? ""),
      },
      createdById: SYSTEM_USER_ID_SENTINEL,
      createdByName: SYSTEM_REFUND_NAME,
      // 환불은 항상 통과해야 함 — race / 음수 잔액 방어.
      allowNegative: true,
    }).catch((refundErr) => {
      console.error(
        `[stocks/buy] CRITICAL 환불 ledger 실패 — 수동 정정 필요 ` +
          `(ticker=${ticker}, shares=${shares}, price=${price}, totalCost=${totalCost}, ` +
          `characterId=${characterId}): `,
        refundErr,
      );
      refundOk = false;
    });

    if (!refundOk) {
      return NextResponse.json(
        {
          error:
            `매수 실패 + 자동 환불 실패. 운영자(GM) 정정 필요. ` +
            `(ticker=${ticker}, shares=${shares}, 차감액=${totalCost})`,
          code: "REFUND_FAILED",
        },
        { status: 500 },
      );
    }

    const message =
      err instanceof Error ? err.message : "주식 보유 적재 실패";
    return NextResponse.json(
      {
        error: `매수 실패 (자동 환불 완료): ${message}`,
        code: "HOLDING_FAILED_REFUNDED",
      },
      { status: 500 },
    );
  }

  await notifyUser({
    userId: mainChar.ownerId,
    type: "CREDIT_RECEIVED",
    title: "주식 매수로 크레딧이 사용되었습니다",
    message: [
      `${mainChar.codename} · ${catalogItem.name} ${shares}주`,
      formatSignedAmount(-totalCost, "CR"),
      `현재 잔액 ${creditTx.balance.toLocaleString()} CR`,
    ].join(" · "),
    link: "/erp/stock",
  });

  const response: BuyResponse = {
    purchase: {
      ticker,
      name: catalogItem.name,
      shares,
      price,
      totalCost,
    },
    balance: creditTx.balance,
    newHolding: {
      shares: newHolding.shares,
      avgPrice: newHolding.avgPrice,
    },
  };
  return NextResponse.json(response, { status: 201 });
}
