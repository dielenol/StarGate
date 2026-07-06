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
import { buildStockMarketIndexHistory } from "@/lib/stocks/market-index";
import { findStockByTicker, STOCK_CATALOG } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";

import type {
  StockHistoryResponse,
  StockHoldingsResponse,
  StockMarketIndexHistoryResponse,
  StockMarketWireResponse,
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
      isSeeded: Boolean(row),
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
    ? new Map(pricesResponse.items.map((p) => [p.ticker, p]))
    : new Map(
        (await getStockPrices()).map((p) => [
          p.ticker,
          { price: p.price, isSeeded: true },
        ] as const),
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
    const currentPriceRow = priceByTicker.get(h.ticker);
    const currentPrice = currentPriceRow?.price ?? meta.basePrice;
    const evaluation = roundStockValue(currentPrice * h.shares);
    const profitLoss = roundStockValue((currentPrice - h.avgPrice) * h.shares);
    const profitPercent =
      h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
    items.push({
      ticker: h.ticker,
      name: meta.name,
      shares: h.shares,
      avgPrice: h.avgPrice,
      currentPrice,
      isPriceSeeded: currentPriceRow?.isSeeded ?? false,
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

/* ── market wire (전 종목 최근 공시) ── */

/**
 * 전 종목 최근 가격 이벤트를 ORDO-NET 공시 피드 형태로 평탄화한다.
 *
 * - `listStockPriceHistory` 는 종목별 오름차순 반환이므로, 여기서 전체 내림차순 정렬.
 * - source 가 trade 인 과거 데이터가 생겨도 같은 피드에 섞어 보여준다.
 */
export async function buildMarketWireResponse(
  days: number = 7,
  limit: number = 12,
): Promise<StockMarketWireResponse> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await Promise.all(
    STOCK_CATALOG.map(async (meta) => {
      const history = await listStockPriceHistory(meta.ticker, safeDays);
      return history.map((row) => {
        const changePercent =
          row.prevPrice > 0
            ? ((row.price - row.prevPrice) / row.prevPrice) * 100
            : 0;
        return {
          ticker: meta.ticker,
          name: meta.name,
          price: row.price,
          prevPrice: row.prevPrice,
          changePercent,
          eventText: row.eventText ?? "공시 문구 미등록",
          source: row.source,
          createdAt: row.createdAt.toISOString(),
        };
      });
    }),
  );

  const items = rows
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, safeLimit);

  return { items, days: safeDays, limit: safeLimit };
}

/* ── market index history (NOVEX) ── */

/**
 * NOVEX 종합지수 시계열 빌더.
 *
 * 종목별 가격 이력을 시간순으로 적용하며, 각 시점의 전체 시총 합계를
 * `buildStockMarketIndexSnapshot` 과 동일한 발행주식수 가중 기준으로 환산한다.
 */
export async function buildMarketIndexHistoryResponse(
  days: number = 7,
): Promise<StockMarketIndexHistoryResponse> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const [prices, rowsByTicker] = await Promise.all([
    getStockPrices(),
    Promise.all(
      STOCK_CATALOG.map(async (meta) => {
        const rows = await listStockPriceHistory(meta.ticker, safeDays);
        return rows.map((row) => ({
          ticker: meta.ticker,
          price: row.price,
          prevPrice: row.prevPrice,
          createdAt: row.createdAt,
        }));
      }),
    ),
  ]);
  const priceByTicker = new Map(prices.map((price) => [price.ticker, price]));
  const currentQuotes = STOCK_CATALOG.map((meta) => {
    const row = priceByTicker.get(meta.ticker);
    return {
      ticker: meta.ticker,
      price: row?.price ?? meta.basePrice,
      prevPrice: row?.prevPrice ?? meta.basePrice,
    };
  });
  const points = buildStockMarketIndexHistory(
    rowsByTicker.flat(),
    currentQuotes,
  );
  return { points, days: safeDays };
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
