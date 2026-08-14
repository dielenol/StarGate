/**
 * POST /api/erp/stocks/buy — 주식 매수 (시세 조회 + 잔액 차감 + 보유 적재).
 *
 * 트랜잭션 정책:
 * - 시세 claim → 잔액 차감 → 보유 적재를 하나의 Mongo transaction으로 커밋한다.
 * - 시세 claim은 거래정지 변경과 같은 가격 문서 write로 직렬화된다.
 * - 후속 단계 실패 시 시세 revision, 잔액, 보유, 멱등 operation이 함께 rollback된다.
 *
 * 본인 메인 캐릭에 한해 매수 가능. 1회 shares 1~50 (tia_bot 동일).
 * 즉시 체결. 가격 변동은 본 라우트와 무관 (M3-A 시점에서는 봇 중지로 가격 변동 없음).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { resolvePlayerServiceAvailability } from "@/lib/auth/player-service-test-access";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { buyHolding } from "@/lib/db/stocks";
import { findUserById } from "@/lib/db/users";
import { formatSignedAmount, notifyUser } from "@/lib/notifications/events";
import { isStockMarketEnabled } from "@/lib/stocks/market";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";
import {
  claimStockPriceForTrade,
  recordSystemStockOrderFlow,
  StockTradeAvailabilityError,
  stockTradeAvailabilityMessage,
} from "@/lib/stocks/trading";

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

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as BuyBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  if (
    !resolvePlayerServiceAvailability(isStockMarketEnabled(), session.user)
  ) {
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
  const ownerId = mainChar.ownerId;

  // owner 비정규화 (ownerName) — credits/shop 라우트와 일관.
  const owner = await findUserById(ownerId);
  if (!owner) {
    return NextResponse.json(
      { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
      { status: 500 },
    );
  }
  const ownerName = owner.discordUsername ?? owner.displayName;

  const characterId = String(mainChar._id);
  const committed: { balance: number | null; totalCost: number | null } = {
    balance: null,
    totalCost: null,
  };
  let response: NextResponse;
  try {
    response = await executeEconomicOperation({
      requestId,
      domain: "stock-buy",
      actorId: session.user.id,
      payload: { ticker, shares },
      run: async (mongoSession) => {
        const occurredAt = new Date();
        const priceDoc = await claimStockPriceForTrade(
          ticker,
          mongoSession,
          occurredAt,
        );
        const price = priceDoc.price;
        const totalCost = roundStockValue(price * shares);
        const creditTx = await addCredit({
          characterId,
          characterCodename: mainChar.codename,
          ownerId,
          ownerName,
          amount: -totalCost,
          type: "STOCK_BUY",
          description: `주식 매수 — ${catalogItem.name} ${shares}주 @${price}¤`,
          metadata: { ticker, shares, price },
          createdById: session.user.id,
          createdByName: session.user.displayName,
          requestId,
          session: mongoSession,
        });
        const newHolding = await buyHolding(characterId, ticker, shares, price, {
          session: mongoSession,
        });
        await recordSystemStockOrderFlow({
          operationKey: requestId,
          characterId,
          ticker,
          side: "BUY",
          shares,
          price,
          occurredAt,
          session: mongoSession,
        });
        committed.balance = creditTx.balance;
        committed.totalCost = totalCost;
        const body: BuyResponse = {
          purchase: { ticker, name: catalogItem.name, shares, price, totalCost },
          balance: creditTx.balance,
          newHolding: { shares: newHolding.shares, avgPrice: newHolding.avgPrice },
        };
        return { status: 201, body };
      },
    });
  } catch (err) {
    if (err instanceof StockTradeAvailabilityError) {
      return NextResponse.json(
        {
          error: stockTradeAvailabilityMessage(err.code),
          code: err.code,
        },
        { status: err.code === "PRICE_NOT_FOUND" ? 500 : 423 },
      );
    }
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return NextResponse.json({ error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "매수 실패", code: "STOCK_BUY_TRANSACTION_FAILED" },
      { status: 500 },
    );
  }

  if (committed.balance !== null && committed.totalCost !== null) {
    void notifyUser({
      userId: ownerId,
      type: "STOCK",
      title: "주식 매수로 크레딧이 사용되었습니다",
      message: [
        `${mainChar.codename} · ${catalogItem.name} ${shares}주`,
        formatSignedAmount(-committed.totalCost, "CR"),
        `현재 잔액 ${committed.balance.toLocaleString()} CR`,
      ].join(" · "),
      link: "/erp/stock",
    }).catch((error) => console.error("[stocks/buy] notification failed", error));
  }
  return response;
}
