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

import { cache } from "react";

import {
  getHoldings,
  getStockPrices,
  listStockPriceHistory,
  listStockPriceHistoryBulk,
  listStockPriceHistoryRowsBulk,
} from "@/lib/db/stocks";
import {
  getStockMarketSnapshot,
  listPendingStockFlowSignals,
} from "@/lib/db/stock-market";
import { getCharacterBalance } from "@/lib/db/credits";
import {
  getStockRealizedProfitSummary,
  listRecentStockLedger,
} from "@/lib/db/stock-account";
import { buildStockMarketIndexHistory } from "@/lib/stocks/market-index";
import { findStockByTicker, STOCK_CATALOG } from "@/lib/stocks/catalog";
import { isNovexV2Enabled } from "@/lib/stocks/market";
import {
  serializeStockFlowSignal,
  serializeStockMarketState,
} from "@/lib/stocks/novex";
import { roundStockValue } from "@/lib/stocks/pricing";

import type {
  StockHistoryResponse,
  StockBalanceResponse,
  StockHoldingsResponse,
  StockLedgerResponse,
  StockMarketIndexHistoryResponse,
  StockMarketWireResponse,
  StockPricesResponse,
  StockRealizedProfitResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

/* ── prices ── */

/**
 * 카탈로그 9 종목 시세 응답 빌더 (prices API 와 동일 형식).
 * stock_prices 미적재 ticker 는 catalog basePrice 로 fallback.
 */
export async function buildPricesResponse(): Promise<StockPricesResponse> {
  const now = new Date();
  const novexEnabled = isNovexV2Enabled();
  const [snapshot, flowSignals, legacyPrices] = await Promise.all([
    novexEnabled ? getStockMarketSnapshot(now) : Promise.resolve(null),
    novexEnabled ? listPendingStockFlowSignals() : Promise.resolve([]),
    novexEnabled ? Promise.resolve([]) : getStockPrices(),
  ]);
  const prices = snapshot?.prices ?? legacyPrices;
  const priceByTicker = new Map(prices.map((p) => [p.ticker, p]));
  const flowByTicker = new Map(
    flowSignals.map((signal) => [signal.ticker, signal]),
  );

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
      isTradingHalted: row?.isTradingHalted === true,
      referencePrice: row?.referencePrice ?? price,
      cooldownUntil:
        row?.cooldownUntil && row.cooldownUntil > now
          ? row.cooldownUntil.toISOString()
          : null,
      cooldownReason:
        row?.cooldownUntil && row.cooldownUntil > now
          ? (row.cooldownReason ?? "급격한 가격 변동")
          : null,
      flowSignal: serializeStockFlowSignal(flowByTicker.get(meta.ticker)),
    };
  });

  return {
    items,
    market: serializeStockMarketState(snapshot?.state ?? null, now),
  };
}

/** SSR 가격 조회 실패 시에도 클라이언트가 동일한 시장 계약을 받게 한다. */
export function buildStockPricesFallback(
  now = new Date(),
): StockPricesResponse {
  return {
    items: [],
    market: serializeStockMarketState(null, now),
  };
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

/* ── stock account read models ── */

/** 현재 캐릭터 잔액만 직렬화한다. 전체 credit ledger는 읽지 않는다. */
export async function buildStockBalanceResponse(
  characterId: string,
): Promise<StockBalanceResponse> {
  return {
    balance: await getCharacterBalance(characterId),
    characterId,
    hasMainCharacter: true,
  };
}

/** ticker별 최근 주식 원장 5건을 클라이언트 전용 DTO로 직렬화한다. */
export async function buildStockLedgerResponse(
  characterId: string,
  ticker: string,
): Promise<StockLedgerResponse> {
  const rows = await listRecentStockLedger(characterId, ticker, 5);
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      type: row.type,
      amount: row.amount,
      balance: row.balance,
      ...(row.metadata ? { metadata: row.metadata } : {}),
      createdAt: row.createdAt.toISOString(),
    })),
    characterId,
    ticker,
    hasMainCharacter: true,
  };
}

/** 모든 STOCK_SELL의 숫자 metadata.profit 합계를 반환한다. */
export async function buildStockRealizedProfitResponse(
  characterId: string,
): Promise<StockRealizedProfitResponse> {
  const summary = await getStockRealizedProfitSummary(characterId);
  return {
    realizedProfit: roundStockValue(summary.realizedProfit),
    countedSales: summary.countedSales,
    totalSales: summary.totalSales,
    characterId,
    hasMainCharacter: true,
  };
}

/* ── history (단일 종목) ── */

/**
 * 단일 종목 가격 시계열 빌더 (history API 와 동일 형식).
 * - days: 1~365 또는 전체(null). 호출자 책임으로 검증된 값을 넘긴다.
 */
export async function buildHistoryResponse(
  ticker: string,
  days: number | null = 30,
): Promise<StockHistoryResponse> {
  const rows = await listStockPriceHistory(ticker, days);
  const items: StockHistoryResponse["items"] = rows.map((r) => {
    const cumulativeSplitFactor = r.cumulativeSplitFactor ?? 1;
    const price = r.adjustedPrice ?? r.price / cumulativeSplitFactor;
    const prevPrice =
      r.prevPrice /
      (cumulativeSplitFactor * (r.splitFactor ?? 1));
    return {
    price,
    prevPrice,
    eventText: r.eventText,
    source: r.source,
    effectiveSequence: r.effectiveSequence,
    referencePrice:
      r.adjustedReferencePrice ??
      (r.referencePrice === undefined
        ? undefined
        : r.referencePrice / cumulativeSplitFactor),
    slotKey: r.slotKey,
    mergedSlotKeys: r.mergedSlotKeys,
    delayed: r.delayed,
    basePercent: r.basePercent,
    flowPercent: r.flowPercent,
    disclosurePercent: r.disclosurePercent,
    disclosureIds: r.disclosureIds,
    markers: [
      ...(r.slotKey
        ? [{ type: "SLOT" as const, label: `가격 회차 ${r.slotKey}` }]
        : []),
      ...((r.disclosureIds ?? []).map((id) => ({
        type: "DISCLOSURE" as const,
        id,
        label: "공시",
      }))),
      ...(r.source === "dividend"
        ? [{ type: "DIVIDEND" as const, label: "배당락" }]
        : []),
      ...(r.source === "split"
        ? [{ type: "SPLIT" as const, label: "액면분할" }]
        : []),
    ],
    createdAt: (r.effectiveAt ?? r.createdAt).toISOString(),
  };
  });
  return { items };
}

/* ── market wire (전 종목 최근 공시) ── */

/**
 * 카탈로그 전 종목의 최근 N 일 가격 이력 flat 행 — wire / index-history 빌더 공용 fetch.
 *
 * 종목별 `listStockPriceHistory` 루프(9 쿼리)를 단일 `$in` 벌크 1 쿼리로 대체.
 * cache() 는 같은 RSC 렌더 패스에서 두 빌더가 동일 days 윈도를 읽을 때
 * (스톡 페이지가 wire + index-history 를 동시 시드) DB 왕복을 1회로 합친다.
 */
const listCatalogHistoryRows = cache(async (days: number) => {
  const tickers = STOCK_CATALOG.map((meta) => meta.ticker);
  return listStockPriceHistoryRowsBulk(tickers, days);
});

/**
 * 전 종목 최근 가격 이벤트를 ORDO-NET 공시 피드 형태로 평탄화한다.
 *
 * - 벌크 조회는 전체 오름차순 flat 배열이므로, 여기서 전체 내림차순 정렬.
 * - source 가 trade 인 과거 데이터가 생겨도 같은 피드에 섞어 보여준다.
 */
export async function buildMarketWireResponse(
  days: number = 7,
  limit: number = 12,
): Promise<StockMarketWireResponse> {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await listCatalogHistoryRows(safeDays);
  const nameByTicker = new Map(
    STOCK_CATALOG.map((meta) => [meta.ticker, meta.name]),
  );

  const items: StockMarketWireResponse["items"] = rows
    .map((row) => {
      const cumulativeSplitFactor = row.cumulativeSplitFactor ?? 1;
      const price = row.adjustedPrice ?? row.price / cumulativeSplitFactor;
      const prevPrice =
        row.prevPrice /
        (cumulativeSplitFactor * (row.splitFactor ?? 1));
      const changePercent =
        prevPrice > 0
          ? ((price - prevPrice) / prevPrice) * 100
          : 0;
      return {
        ticker: row.ticker,
        name: nameByTicker.get(row.ticker) ?? row.ticker,
        price,
        prevPrice,
        changePercent,
        eventText: row.eventText ?? "공시 문구 미등록",
        source: row.source,
        effectiveSequence: row.effectiveSequence,
        createdAt: (row.effectiveAt ?? row.createdAt).toISOString(),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        (b.effectiveSequence ?? 0) - (a.effectiveSequence ?? 0),
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
  const [prices, historyRows] = await Promise.all([
    getStockPrices(),
    listCatalogHistoryRows(safeDays),
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
  // buildStockMarketIndexHistory 는 entries 를 내부에서 createdAt 오름차순 재정렬하므로
  // flat 벌크 행(전역 오름차순)을 그대로 넘겨도 기존 per-ticker 그룹 입력과 동일 결과.
  const points = buildStockMarketIndexHistory(
    historyRows.map((row) => ({
      ticker: row.ticker,
      price: row.adjustedPrice ?? row.price,
      prevPrice:
        row.prevPrice /
        ((row.cumulativeSplitFactor ?? 1) * (row.splitFactor ?? 1)),
      createdAt: row.effectiveAt ?? row.createdAt,
    })),
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
