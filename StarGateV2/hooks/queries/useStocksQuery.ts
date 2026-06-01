/**
 * 주식 시세 / 보유 / 가격 시계열 query hooks.
 *
 * - `useStockPrices`: GET /api/erp/stocks/prices — 9 종목 시세 + 변동률.
 * - `useStockHoldings`: GET /api/erp/stocks/holdings — 본인 메인 캐릭의 보유 + 평가/손익.
 * - `useStockHistory(ticker)`: GET /api/erp/stocks/history?ticker= — 차트용 30 일 시계열.
 * - `useStockMarketWire`: GET /api/erp/stocks/wire — 전 종목 최근 공시 피드.
 *
 * 에러 분기 — `StocksApiError.code` 로 클라이언트 분기 가능 (shop/credits 와 동일 패턴).
 *
 * staleTime:
 * - prices / holdings: 30 초 — 매수/매도 후 invalidate 가 즉시 반영, 평소 짧은 stale 로 재진입 빠름.
 * - history: 5 분 — 가격 변동이 거의 없는 M3-A 시점 + 차트 렌더 비용 회피.
 */

import { useQuery } from "@tanstack/react-query";

/* ── Query keys ── */

export const stocksKeys = {
  all: ["stocks"] as const,
  prices: ["stocks", "prices"] as const,
  holdings: ["stocks", "holdings"] as const,
  history: (ticker: string, days: number) =>
    ["stocks", "history", ticker, days] as const,
  marketWire: (days: number, limit: number) =>
    ["stocks", "market-wire", days, limit] as const,
  sparklines: (days: number) => ["stocks", "sparklines", days] as const,
};

/* ── 에러 타입 ── */

export type StocksErrorCode =
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "PRICE_NOT_FOUND"
  | "MARKET_CLOSED"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_SHARES"
  | "REFUND_FAILED"
  | "HOLDING_FAILED_REFUNDED"
  | "SELL_LEDGER_FAILED_RESTORED"
  | "RESTORE_FAILED";

const STOCKS_ERROR_CODES: ReadonlySet<StocksErrorCode> = new Set([
  "NO_MAIN_CHARACTER",
  "MAIN_CHARACTER_INTEGRITY",
  "PRICE_NOT_FOUND",
  "MARKET_CLOSED",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_SHARES",
  "REFUND_FAILED",
  "HOLDING_FAILED_REFUNDED",
  "SELL_LEDGER_FAILED_RESTORED",
  "RESTORE_FAILED",
]);

/** 서버 응답 `code` 가 알려진 에러 코드인지 검증 (mutation 측 type narrow 에 재사용). */
export function isKnownStocksErrorCode(
  code: unknown,
): code is StocksErrorCode {
  return typeof code === "string" && STOCKS_ERROR_CODES.has(code as StocksErrorCode);
}

export class StocksApiError extends Error {
  readonly status: number;
  readonly code?: StocksErrorCode;
  constructor(message: string, status: number, code?: StocksErrorCode) {
    super(message);
    this.name = "StocksApiError";
    this.status = status;
    this.code = code;
  }
}

/* ── 응답 타입 ── */

export interface StockPriceItem {
  ticker: string;
  name: string;
  basePrice: number;
  description: string;
  price: number;
  prevPrice: number;
  eventText: string;
  changePercent: number;
  lastUpdate: string;
  /** stock_prices row exists. false means catalog fallback only and trading is disabled. */
  isSeeded: boolean;
}

export interface StockPricesResponse {
  items: StockPriceItem[];
}

export interface StockHoldingItem {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  /** stock_prices row exists. false means currentPrice is catalog fallback. */
  isPriceSeeded: boolean;
  evaluation: number;
  profitLoss: number;
  profitPercent: number;
}

export interface StockHoldingsResponse {
  items: StockHoldingItem[];
  hasMainCharacter: boolean;
}

export interface StockHistoryItem {
  price: number;
  prevPrice: number;
  eventText?: string;
  source: "scheduled" | "trade" | "gm-event";
  /** ISO 8601. 클라이언트에서 new Date() 로 파싱. */
  createdAt: string;
}

export interface StockHistoryResponse {
  items: StockHistoryItem[];
}

export interface StockMarketWireItem {
  ticker: string;
  name: string;
  price: number;
  prevPrice: number;
  changePercent: number;
  eventText: string;
  source: "scheduled" | "trade" | "gm-event";
  createdAt: string;
}

export interface StockMarketWireResponse {
  items: StockMarketWireItem[];
  days: number;
  limit: number;
}

export interface StockSparklinePoint {
  /** ISO 8601. 차트 라이브러리 X 축은 string 그대로 사용해도 무방. */
  ts: string;
  price: number;
}

export interface StockSparkline {
  ticker: string;
  points: StockSparklinePoint[];
}

export interface StockSparklinesResponse {
  items: StockSparkline[];
  days: number;
}

/* ── Fetchers ── */

async function parseStocksError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: unknown;
  };
  throw new StocksApiError(
    body.error ?? "주식 API 호출에 실패했습니다.",
    res.status,
    isKnownStocksErrorCode(body.code) ? body.code : undefined,
  );
}

async function fetchStockPrices(): Promise<StockPricesResponse> {
  const res = await fetch("/api/erp/stocks/prices");
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockHoldings(): Promise<StockHoldingsResponse> {
  const res = await fetch("/api/erp/stocks/holdings");
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockHistory(
  ticker: string,
  days: number,
): Promise<StockHistoryResponse> {
  const res = await fetch(
    `/api/erp/stocks/history?ticker=${encodeURIComponent(ticker)}&days=${days}`,
  );
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockSparklines(
  days: number,
): Promise<StockSparklinesResponse> {
  const res = await fetch(`/api/erp/stocks/sparklines?days=${days}`);
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockMarketWire(
  days: number,
  limit: number,
): Promise<StockMarketWireResponse> {
  const params = new URLSearchParams({
    days: String(days),
    limit: String(limit),
  });
  const res = await fetch(`/api/erp/stocks/wire?${params.toString()}`);
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

/* ── Hooks ── */

const PRICES_STALE_MS = 60 * 1000;
const HOLDINGS_STALE_MS = 60 * 1000;
const HISTORY_STALE_MS = 15 * 60 * 1000;
const MARKET_WIRE_STALE_MS = 60 * 1000;
const SPARKLINES_STALE_MS = 10 * 60 * 1000;

export function useStockPrices(options?: {
  initialData?: StockPricesResponse;
}) {
  return useQuery({
    queryKey: stocksKeys.prices,
    queryFn: fetchStockPrices,
    staleTime: PRICES_STALE_MS,
    initialData: options?.initialData,
  });
}

export function useStockHoldings(options?: {
  initialData?: StockHoldingsResponse;
}) {
  return useQuery({
    queryKey: stocksKeys.holdings,
    queryFn: fetchStockHoldings,
    staleTime: HOLDINGS_STALE_MS,
    initialData: options?.initialData,
    // 메인 캐릭 정합성 위반은 사용자 인풋으로 회복 불가 → 재시도 비활성.
    retry: (failureCount, err) => {
      if (err instanceof StocksApiError && err.status === 409) return false;
      return failureCount < 2;
    },
  });
}

export function useStockHistory(
  ticker: string,
  options?: {
    initialData?: StockHistoryResponse;
    enabled?: boolean;
    /** 조회 일수. 1~30. 기본 30 (기존 호출처 호환). */
    days?: number;
  },
) {
  const days = options?.days ?? 30;
  return useQuery({
    queryKey: stocksKeys.history(ticker, days),
    queryFn: () => fetchStockHistory(ticker, days),
    staleTime: HISTORY_STALE_MS,
    initialData: options?.initialData,
    // ticker 비어 있으면 호출 안 함. 호출자가 명시적으로 disable 하고 싶을 때도 활용.
    enabled: ticker.length > 0 && (options?.enabled ?? true),
  });
}

/**
 * 카탈로그 전 종목의 sparkline 시계열 (카드 미니 차트).
 *
 * - days: 1~30. 기본 7.
 * - history hook 과 동일 staleTime 정책 (변동 적음).
 */
export function useStockSparklines(
  days: number = 7,
  options?: { initialData?: StockSparklinesResponse },
) {
  return useQuery({
    queryKey: stocksKeys.sparklines(days),
    queryFn: () => fetchStockSparklines(days),
    staleTime: SPARKLINES_STALE_MS,
    initialData: options?.initialData,
  });
}

/**
 * 전 종목 최근 공시 피드.
 *
 * - scheduled / gm-event / trade source 를 같은 타임라인으로 노출.
 * - GM 수동 개입과 정기 크론 직후 즉시 갱신되도록 staleTime 은 짧게 둔다.
 */
export function useStockMarketWire(
  options?: {
    initialData?: StockMarketWireResponse;
    days?: number;
    limit?: number;
  },
) {
  const days = options?.days ?? 7;
  const limit = options?.limit ?? 12;
  return useQuery({
    queryKey: stocksKeys.marketWire(days, limit),
    queryFn: () => fetchStockMarketWire(days, limit),
    staleTime: MARKET_WIRE_STALE_MS,
    initialData: options?.initialData,
  });
}
