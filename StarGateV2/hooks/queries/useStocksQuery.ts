/**
 * 주식 시세 / 보유 / 가격 시계열 query hooks.
 *
 * - `useStockPrices`: GET /api/erp/stocks/prices — 9 종목 시세 + 변동률.
 * - `useStockHoldings`: GET /api/erp/stocks/holdings — 본인 메인 캐릭의 보유 + 평가/손익.
 * - `useStockHistory(ticker)`: GET /api/erp/stocks/history?ticker= — 차트용 30 일 시계열.
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
  history: (ticker: string) => ["stocks", "history", ticker] as const,
};

/* ── 에러 타입 ── */

export type StocksErrorCode =
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "PRICE_NOT_FOUND"
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
): Promise<StockHistoryResponse> {
  const res = await fetch(
    `/api/erp/stocks/history?ticker=${encodeURIComponent(ticker)}`,
  );
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

/* ── Hooks ── */

const PRICES_STALE_MS = 30 * 1000;
const HOLDINGS_STALE_MS = 30 * 1000;
const HISTORY_STALE_MS = 5 * 60 * 1000;

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
  options?: { initialData?: StockHistoryResponse; enabled?: boolean },
) {
  return useQuery({
    queryKey: stocksKeys.history(ticker),
    queryFn: () => fetchStockHistory(ticker),
    staleTime: HISTORY_STALE_MS,
    initialData: options?.initialData,
    // ticker 비어 있으면 호출 안 함. 호출자가 명시적으로 disable 하고 싶을 때도 활용.
    enabled: ticker.length > 0 && (options?.enabled ?? true),
  });
}
