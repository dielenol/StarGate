/**
 * POST /api/erp/stocks/sell — 주식 매도 (보유 차감 + 잔액 적립).
 *
 * 트랜잭션 정책 — **보상(Saga) 패턴** (mongo session 미도입, stocks/buy 와 거울):
 * - 본 라우트는 3 단계 (getStockPrice → sellHolding → addCredit) 가 모두 성공해야 정상.
 * - sellHolding 이 atomic 부족 거절(ok=false) 일 땐 상태 미변 → 보상 불필요.
 * - addCredit 실패 시 buyHolding 으로 holding 복구 (보상). 복구 실패는 console.error.
 *
 * 본인 메인 캐릭에 한해 매도 가능. 1회 shares 1~50 (매수와 동일한 한도).
 * 즉시 체결. 가격 변동은 본 라우트와 무관 (M3-A 시점에서는 봇 중지).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { getStockPrice, sellHolding } from "@/lib/db/stocks";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import { isStockMarketEnabled } from "@/lib/stocks/market";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";

/* ── 상수 ── */

const MIN_SHARES = 1;
const MAX_SHARES = 50;

/* ── 타입 ── */

interface SellBody {
  ticker?: string;
  shares?: number;
}

interface SellResponse {
  sale: {
    ticker: string;
    name: string;
    shares: number;
    price: number;
    totalProceeds: number;
    /** (price - avgPrice) * shares. 음수 가능 (손절). */
    profit: number;
  };
  balance: number;
  remainingShares: number;
}

/* ── 핸들러 ── */

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

  const body = (await request.json().catch(() => null)) as SellBody | null;
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
  // 누설 방지 — buy/route.ts 와 동일 정책. throw 메시지(codename 들 포함)는
  // 운영 채널 로그에만 남기고 사용자에게는 일반화된 메시지만 반환.
  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    console.error(
      `[stocks/sell] findMainCharacterByOwner integrity violation (userId=${session.user.id}): `,
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
        error: "메인 AGENT 캐릭터가 등록되어 있지 않아 매도할 수 없습니다.",
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

  const owner = await findUserById(ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  /* ── Saga: getStockPrice → sellHolding → addCredit ── */

  // Step 1: 시세 조회 — 시드 미적재 거부.
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
  const totalProceeds = roundStockValue(price * shares);

  const characterId = String(mainChar._id);
  const committed: { notification: { balance: number; profit: number } | null } = {
    notification: null,
  };
  let response: NextResponse;
  try {
    response = await executeEconomicOperation({
      requestId,
      domain: "stock-sell",
      actorId: session.user.id,
      payload: { ticker, shares },
      run: async (mongoSession) => {
        const sellResult = await sellHolding(characterId, ticker, shares, {
          session: mongoSession,
        });
        if (!sellResult.ok) throw new Error("INSUFFICIENT_SHARES");
        const profit = roundStockValue((price - sellResult.avgPrice) * shares);
        const creditTx = await addCredit({
          characterId,
          characterCodename: mainChar.codename,
          ownerId,
          ownerName,
          amount: totalProceeds,
          type: "STOCK_SELL",
          description: `주식 매도 — ${catalogItem.name} ${shares}주 @${price}¤`,
          metadata: { ticker, shares, price, avgPrice: sellResult.avgPrice, profit },
          createdById: session.user.id,
          createdByName: session.user.displayName,
          requestId,
          allowNegative: true,
          session: mongoSession,
        });
        committed.notification = { balance: creditTx.balance, profit };
        const body: SellResponse = {
          sale: { ticker, name: catalogItem.name, shares, price, totalProceeds, profit },
          balance: creditTx.balance,
          remainingShares: sellResult.remainingShares,
        };
        return { status: 200, body };
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "매도 실패";
    if (message === "INSUFFICIENT_SHARES") {
      return NextResponse.json({ error: "보유 주식이 부족합니다.", code: message }, { status: 400 });
    }
    return NextResponse.json({ error: message, code: "STOCK_SELL_TRANSACTION_FAILED" }, { status: 500 });
  }

  if (committed.notification) {
    const { balance } = committed.notification;
    void notifyUser({
      userId: ownerId,
      type: "CREDIT_RECEIVED",
      title: "주식 매도로 크레딧이 적립되었습니다",
      message: [
        `${mainChar.codename} · ${catalogItem.name} ${shares}주`,
        formatSignedAmount(totalProceeds, "CR"),
        `현재 잔액 ${balance.toLocaleString()} CR`,
      ].join(" · "),
      link: "/erp/stock",
    }).catch((error) => console.error("[stocks/sell] notification failed", error));
  }
  return response;
}
