/**
 * GET /api/erp/stocks/holdings — 본인 메인 캐릭의 주식 보유 (시세 평가/손익 동봉).
 *
 * - stock_holdings.characterId 단위 조회 (Phase 2 ledger 와 일관).
 * - stock_prices 조인하여 각 holding 에 currentPrice/evaluation/profitLoss/profitPercent 부착.
 * - SHOP/credit 라우트와 동일하게 메인 미등록 200 + hasMainCharacter:false, 정합성 위반 409.
 *
 * 캐시: private 30s + SWR 60s — 매수/매도 후 클라이언트 invalidate.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getHoldings, getStockPrices } from "@/lib/db/stocks";
import { findStockByTicker } from "@/lib/stocks/catalog";

interface HoldingItem {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  /** currentPrice * shares (정수 — 가격이 정수 도메인). */
  evaluation: number;
  /** (currentPrice - avgPrice) * shares (음수 가능). */
  profitLoss: number;
  /** avgPrice > 0 일 때 ((current - avg) / avg) * 100. avg=0 fallback 시 0. */
  profitPercent: number;
}

interface HoldingsResponse {
  items: HoldingItem[];
  hasMainCharacter: boolean;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 누설 방지 — buy/route.ts 와 동일 정책. throw 메시지(codename 들 포함)는
  // 운영 채널 로그에만 남기고 사용자에게는 일반화된 메시지만 반환.
  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    console.error(
      `[stocks/holdings] findMainCharacterByOwner integrity violation (userId=${session.user.id}): `,
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
    const empty: HoldingsResponse = { items: [], hasMainCharacter: false };
    return NextResponse.json(empty, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  }

  try {
    const characterId = String(mainChar._id);
    // holdings + prices 병렬 조회 (서로 의존성 없음).
    const [holdings, prices] = await Promise.all([
      getHoldings(characterId),
      getStockPrices(),
    ]);
    const priceByTicker = new Map(prices.map((p) => [p.ticker, p.price]));

    const items: HoldingItem[] = [];
    for (const h of holdings) {
      const meta = findStockByTicker(h.ticker);
      // 카탈로그 외 ticker (legacy / 봇 직삽 등) — 표시 제외 + 운영 채널 경고.
      // M3-B 에서 legacy 라벨 표시 + 매도만 허용 처리 예정.
      if (!meta) {
        console.warn(
          `[stocks/holdings] catalog 외 ticker 보유 발견 — 표시 제외 ` +
            `(characterId=${characterId}, ticker=${h.ticker}, shares=${h.shares}, avgPrice=${h.avgPrice})`,
        );
        continue;
      }
      const currentPrice = priceByTicker.get(h.ticker) ?? 0;
      const evaluation = currentPrice * h.shares;
      const profitLoss = (currentPrice - h.avgPrice) * h.shares;
      const profitPercent =
        h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
      items.push({
        ticker: h.ticker,
        name: meta.name,
        shares: h.shares,
        avgPrice: h.avgPrice,
        currentPrice,
        evaluation,
        profitLoss,
        profitPercent,
      });
    }

    const response: HoldingsResponse = { items, hasMainCharacter: true };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "보유 주식 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
