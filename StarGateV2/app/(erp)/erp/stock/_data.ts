/**
 * stock 섹션 server-only 데이터 빌더 모음.
 *
 * - 3 페이지 (`/erp/stock` list, `/erp/stock/[ticker]` detail, `/erp/stock/portfolio`) 가
 *   각자 필요한 빌더를 호출해 initialData 를 만든다.
 * - 응답 형식은 각 API 라우트(`/api/erp/stocks/{prices,holdings,history,sparklines}`) 와
 *   동일 — useQuery 의 initialData 시드로 그대로 주입.
 *
 * server-only — 클라이언트 import 금지 (lib/db/* 사이드이펙트 + Mongo 호출).
 */

import "server-only";

import {
  getHoldings,
  getStockPrices,
  listStockPriceHistory,
  listStockPriceHistoryBulk,
} from "@/lib/db/stocks";
import { findStockByTicker, STOCK_CATALOG } from "@/lib/stocks/catalog";

import type {
  StockHistoryResponse,
  StockHoldingsResponse,
  StockPricesResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

/* ── prices ── */

/**
 * 카탈로그 9 종목 시세 응답 빌더 (prices API 와 동일 형식).
 * stock_prices 미적재 ticker 는 catalog basePrice 로 fallback.
 */
export async function buildPricesResponse(): Promise<StockPricesResponse> {
  const prices = await getStockPrices();
  const priceByTicker = new Map(prices.map((p) => [p.ticker, p]));

  const items: StockPricesResponse["items"] = STOCK_CATALOG.map((meta) => {
    const row = priceByTicker.get(meta.ticker);
    const price = row?.price ?? meta.basePrice;
    const prevPrice = row?.prevPrice ?? meta.basePrice;
    const eventText = row?.eventText ?? "";
    const lastUpdate = row?.lastUpdate ?? "";
    const changePercent =
      prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    return {
      ticker: meta.ticker,
      name: meta.name,
      basePrice: meta.basePrice,
      description: meta.description,
      price,
      prevPrice,
      eventText,
      changePercent,
      lastUpdate,
    };
  });

  return { items };
}

/* ── holdings ── */

/**
 * 메인 캐릭터 보유 응답 빌더 (holdings API 와 동일 형식).
 *
 * - mainCharacterId 가 null 이면 빈 items + hasMainCharacter:false.
 * - 카탈로그 외 ticker 보유는 표시 제외 + 경고 로그 (holdings API 와 동일 정책).
 * - `pricesResponse` 를 받으면 중복 `getStockPrices()` 호출 회피 (detail/portfolio 페이지가
 *   이미 buildPricesResponse 를 호출한 경우 그 결과를 재사용 — SSR 라운드트립 절감).
 */
export async function buildHoldingsResponse(
  mainCharacterId: string | null,
  pricesResponse?: StockPricesResponse,
): Promise<StockHoldingsResponse> {
  if (!mainCharacterId) {
    return { items: [], hasMainCharacter: false };
  }

  const priceByTicker = pricesResponse
    ? new Map(pricesResponse.items.map((p) => [p.ticker, p.price]))
    : new Map(
        (await getStockPrices()).map((p) => [p.ticker, p.price] as const),
      );

  const holdings = await getHoldings(mainCharacterId);

  const items: StockHoldingsResponse["items"] = [];
  for (const h of holdings) {
    const meta = findStockByTicker(h.ticker);
    if (!meta) {
      console.warn(
        `[stock/_data] catalog 외 ticker 보유 발견 — 표시 제외 ` +
          `(characterId=${mainCharacterId}, ticker=${h.ticker}, shares=${h.shares}, avgPrice=${h.avgPrice})`,
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

  return { items, hasMainCharacter: true };
}

/* ── history (단일 종목) ── */

/**
 * 단일 종목 가격 시계열 빌더 (history API 와 동일 형식).
 * - days: 1~30. 호출자 책임으로 검증된 값을 넘긴다 (페이지 default 30).
 */
export async function buildHistoryResponse(
  ticker: string,
  days: number = 30,
): Promise<StockHistoryResponse> {
  const rows = await listStockPriceHistory(ticker, days);
  const items: StockHistoryResponse["items"] = rows.map((r) => ({
    price: r.price,
    prevPrice: r.prevPrice,
    eventText: r.eventText,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items };
}

/* ── sparklines (전 종목 동시) ── */

/**
 * 카탈로그 전 종목 sparkline 시계열 빌더 (sparklines API 와 동일 형식).
 *
 * - days: 1~30. list view 카드 미니차트는 7 권장.
 * - listStockPriceHistoryBulk 는 시계열이 비어 있는 ticker 를 결과 배열에서 누락하므로
 *   API 라우트와 동일하게 결과를 그대로 매핑. 클라이언트가 ticker 별 lookup 으로 처리.
 */
export async function buildSparklinesResponse(
  days: number = 7,
): Promise<StockSparklinesResponse> {
  const tickers = STOCK_CATALOG.map((m) => m.ticker);
  const rows = await listStockPriceHistoryBulk(tickers, days);

  const items: StockSparklinesResponse["items"] = rows.map((row) => ({
    ticker: row.ticker,
    points: row.points.map((p) => ({
      ts: p.ts.toISOString(),
      price: p.price,
    })),
  }));

  return { items, days };
}
