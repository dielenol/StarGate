/**
 * 주식 시세 / 보유 / 가격 시계열 query hooks.
 *
 * - `useStockPrices`: GET /api/erp/stocks/prices — 9 종목 시세 + 변동률.
 * - `useStockHoldings`: GET /api/erp/stocks/holdings — 본인 메인 캐릭의 보유 + 평가/손익.
 * - `useStockHistory(ticker)`: GET /api/erp/stocks/history?ticker= — 차트용 30 일 시계열.
 * - `useStockMarketIndexHistory`: GET /api/erp/stocks/index-history — NOVEX 지수 시계열.
 * - `useStockMarketWire`: GET /api/erp/stocks/wire — 전 종목 최근 공시 피드.
 *
 * 에러 분기 — `StocksApiError.code` 로 클라이언트 분기 가능 (shop/credits 와 동일 패턴).
 *
 * staleTime:
 * - prices / holdings: 30 초 — 매수/매도 후 invalidate 가 즉시 반영, 평소 짧은 stale 로 재진입 빠름.
 * - history: 5 분 — 가격 변동이 거의 없는 M3-A 시점 + 차트 렌더 비용 회피.
 */

import { useQuery } from "@tanstack/react-query";

import {
  creditKeys,
  type CreditBalanceResponse,
  useCreditBalance,
} from "@/hooks/queries/useCreditsQuery";
import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
/* ── Query keys ── */

export const stocksKeys = {
  all: ["stocks"] as const,
  prices: ["stocks", "prices"] as const,
  marketState: ["stocks", "market-state"] as const,
  holdings: ["stocks", "holdings"] as const,
  adminHoldings: ["stocks", "admin-holdings"] as const,
  history: (ticker: string, range: number | StockHistoryRange) =>
    ["stocks", "history", ticker, range] as const,
  marketIndexHistory: (days: number) =>
    ["stocks", "market-index-history", days] as const,
  marketWire: (days: number, limit: number) =>
    ["stocks", "market-wire", days, limit] as const,
  sparklines: (days: number) => ["stocks", "sparklines", days] as const,
};

/**
 * 주식 화면이 소비하는 크레딧 파생 read model.
 *
 * `creditKeys.all` 아래에 두어 기존 크레딧 mutation/realtime의 prefix invalidation을
 * 그대로 받되, 전체 CreditsResponse와 서로 다른 query key/response shape를 사용한다.
 */
export const stockAccountKeys = {
  all: [...creditKeys.all, "stocks"] as const,
  ledger: (characterId: string, ticker: string) =>
    [...creditKeys.all, "stocks", "ledger", characterId, ticker] as const,
  realizedProfit: (characterId: string) =>
    [...creditKeys.all, "stocks", "realized-profit", characterId] as const,
};

/* ── 에러 타입 ── */

export type StocksErrorCode =
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY"
  | "PRICE_NOT_FOUND"
  | "MARKET_CLOSED"
  | "MARKET_OPENING_PENDING"
  | "STOCK_TRADING_HALTED"
  | "STOCK_COOLING_DOWN"
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
  "MARKET_OPENING_PENDING",
  "STOCK_TRADING_HALTED",
  "STOCK_COOLING_DOWN",
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
  /** true면 해당 종목만 매수/매도 불가. */
  isTradingHalted: boolean;
  /** 동적 적정가. 전환 전 문서는 현재가와 동일하게 직렬화한다. */
  referencePrice: number;
  /** 정방향 액면분할 누적계수. */
  cumulativeSplitFactor: number;
  cumulativeCapitalIncreaseFactor: number;
  companyProfile: {
    majorShareholders: Array<{
      name: string;
      stakePercent: number;
      note?: string;
    }>;
    sourceDisclosureId: string;
    updatedAt: string;
  } | null;
  /** 자동 냉각 종료 시각. 냉각 중이 아니면 null. */
  cooldownUntil: string | null;
  cooldownReason: string | null;
  /** 정확한 산식은 숨기고 다음 회차에 반영될 방향/강도/거래량만 공개한다. */
  flowSignal: StockOrderFlowSignal | null;
}

export type StockMarketStatus = "OPEN" | "CLOSED" | "OPENING_PENDING";

export interface StockOrderFlowSignal {
  direction: "BUY" | "SELL" | "BALANCED";
  strength: "WEAK" | "MODERATE" | "STRONG";
  volume: number;
}

export interface StockMarketStateItem {
  status: StockMarketStatus;
  reason: string;
  asOf: string;
  opensAt: string | null;
  closesAt: string | null;
  nextPriceSlotAt: string | null;
  delayed: boolean;
  pendingSlotKeys: string[];
  earlyCloseAt: string | null;
}

export interface StockPricesResponse {
  items: StockPriceItem[];
  market: StockMarketStateItem;
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

export interface StockAdminHoldingRow {
  characterId: string;
  characterCodename: string;
  characterType: "AGENT" | "NPC";
  ownerId: string | null;
  ownerName: string | null;
  ticker: string;
  stockName: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  evaluation: number;
  profitLoss: number;
  profitPercent: number;
  updatedAt: string;
}

export interface StockAdminHoldingsResponse {
  rows: StockAdminHoldingRow[];
  generatedAt: string;
}

export type StockHistoryRange = "1d" | "1w" | "1m" | "3m" | "1y" | "all";

export interface StockHistoryItem {
  price: number;
  prevPrice: number;
  referencePrice?: number;
  eventText?: string;
  source:
    | "scheduled"
    | "trade"
    | "gm-event"
    | "disclosure"
    | "corporate-action"
    | "dividend"
    | "split"
    | "rights-offering";
  slotKey?: string;
  /** 같은 경제 시각의 배당락→분할→가격 회차 순번. */
  effectiveSequence?: number;
  mergedSlotKeys?: string[];
  delayed?: boolean;
  basePercent?: number;
  flowPercent?: number;
  disclosurePercent?: number;
  disclosureIds?: string[];
  markers?: Array<{
    type: "SLOT" | "DISCLOSURE" | "DIVIDEND" | "SPLIT" | "RIGHTS_OFFERING";
    id?: string;
    label: string;
  }>;
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
  source: StockHistoryItem["source"];
  effectiveSequence?: number;
  createdAt: string;
}

export interface StockMarketWireResponse {
  items: StockMarketWireItem[];
  days: number;
  limit: number;
}

export interface StockMarketIndexHistoryPoint {
  /** ISO 8601. */
  ts: string;
  value: number;
  totalMarketCap: number;
}

export interface StockMarketIndexHistoryResponse {
  points: StockMarketIndexHistoryPoint[];
  days: number;
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

export type StockBalanceResponse = CreditBalanceResponse;

export interface StockLedgerItem {
  id: string;
  type: "STOCK_BUY" | "STOCK_SELL";
  amount: number;
  balance: number;
  metadata?: {
    ticker?: string;
    shares?: number;
    price?: number;
    profit?: number;
  };
  createdAt: string;
}

export interface StockLedgerResponse {
  items: StockLedgerItem[];
  characterId: string | null;
  ticker: string;
  hasMainCharacter: boolean;
}

export interface StockRealizedProfitResponse {
  realizedProfit: number;
  countedSales: number;
  totalSales: number;
  characterId: string | null;
  hasMainCharacter: boolean;
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

function retryOwnedStockRead(failureCount: number, error: Error): boolean {
  if (error instanceof StocksApiError && error.status === 409) return false;
  return failureCount < 2;
}

async function fetchStockPrices(): Promise<StockPricesResponse> {
  // 시세/거래정지는 TanStack Query를 클라이언트 캐시 SSOT로 사용한다. 브라우저 HTTP
  // cache가 GM 상태 변경 직후 이전 값을 되돌리지 않도록 항상 서버에서 재검증한다.
  const res = await fetch("/api/erp/stocks/prices", { cache: "no-store" });
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockHoldings(): Promise<StockHoldingsResponse> {
  const res = await fetch("/api/erp/stocks/holdings", { cache: "no-store" });
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockAdminHoldings(): Promise<StockAdminHoldingsResponse> {
  const res = await fetch("/api/erp/admin/stocks/holdings", {
    cache: "no-store",
  });
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockHistory(
  ticker: string,
  range: number | StockHistoryRange,
): Promise<StockHistoryResponse> {
  const rangeParam =
    typeof range === "number" ? `days=${range}` : `range=${range}`;
  const res = await fetch(
    `/api/erp/stocks/history?ticker=${encodeURIComponent(ticker)}&${rangeParam}`,
    { cache: "no-store" },
  );
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockSparklines(
  days: number,
): Promise<StockSparklinesResponse> {
  const res = await fetch(`/api/erp/stocks/sparklines?days=${days}`, {
    cache: "no-store",
  });
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockMarketIndexHistory(
  days: number,
): Promise<StockMarketIndexHistoryResponse> {
  const res = await fetch(`/api/erp/stocks/index-history?days=${days}`, {
    cache: "no-store",
  });
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
  const res = await fetch(`/api/erp/stocks/wire?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) await parseStocksError(res);
  return res.json();
}

async function fetchStockLedger(
  ticker: string,
  expectedCharacterId: string,
): Promise<StockLedgerResponse> {
  const res = await fetch(
    `/api/erp/stocks/ledger?ticker=${encodeURIComponent(ticker)}`,
  );
  if (!res.ok) await parseStocksError(res);
  const data = (await res.json()) as StockLedgerResponse;
  if (!data.hasMainCharacter || data.characterId !== expectedCharacterId) {
    throw new StocksApiError(
      "메인 캐릭터 정보가 변경되었습니다. 페이지를 새로고침해 주세요.",
      409,
    );
  }
  return data;
}

async function fetchStockRealizedProfit(
  expectedCharacterId: string,
): Promise<StockRealizedProfitResponse> {
  const res = await fetch("/api/erp/stocks/realized-profit");
  if (!res.ok) await parseStocksError(res);
  const data = (await res.json()) as StockRealizedProfitResponse;
  if (!data.hasMainCharacter || data.characterId !== expectedCharacterId) {
    throw new StocksApiError(
      "메인 캐릭터 정보가 변경되었습니다. 페이지를 새로고침해 주세요.",
      409,
    );
  }
  return data;
}

/* ── Hooks ── */

const PRICES_STALE_MS = 60 * 1000;
const HOLDINGS_STALE_MS = 60 * 1000;
const ADMIN_HOLDINGS_STALE_MS = 60 * 1000;
const HISTORY_STALE_MS = 15 * 60 * 1000;
const MARKET_INDEX_HISTORY_STALE_MS = 60 * 1000;
const MARKET_WIRE_STALE_MS = 60 * 1000;
const SPARKLINES_STALE_MS = 10 * 60 * 1000;
const STOCK_ACCOUNT_STALE_MS = 5 * 60 * 1000;
const MARKET_REFETCH_INTERVAL_MS = 60 * 1000;

export function useStockPrices(options?: {
  initialData?: StockPricesResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: stocksKeys.prices,
    queryFn: fetchStockPrices,
    staleTime: PRICES_STALE_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}

export function useStockHoldings(options?: {
  initialData?: StockHoldingsResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: stocksKeys.holdings,
    queryFn: fetchStockHoldings,
    staleTime: HOLDINGS_STALE_MS,
    initialData: options?.initialData,
    refetchOnWindowFocus: true,
    refetchInterval,
    refetchIntervalInBackground: false,
    // 메인 캐릭 정합성 위반은 사용자 인풋으로 회복 불가 → 재시도 비활성.
    retry: retryOwnedStockRead,
  });
}

export function useStockAdminHoldings(options?: {
  initialData?: StockAdminHoldingsResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: stocksKeys.adminHoldings,
    queryFn: fetchStockAdminHoldings,
    staleTime: ADMIN_HOLDINGS_STALE_MS,
    initialData: options?.initialData,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useStockHistory(
  ticker: string,
  options?: {
    initialData?: StockHistoryResponse;
    enabled?: boolean;
    /** 조회 일수. 1~365. 기본 30 (기존 호출처 호환). */
    days?: number;
    /** NOVEX 2.0 차트 범위. 지정하면 days보다 우선한다. */
    range?: StockHistoryRange;
  },
) {
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  const range =
    options?.range ?? (options?.days === 0 ? "all" : options?.days) ?? 30;
  return useQuery({
    queryKey: stocksKeys.history(ticker, range),
    queryFn: () => fetchStockHistory(ticker, range),
    staleTime: HISTORY_STALE_MS,
    initialData: options?.initialData,
    // ticker 비어 있으면 호출 안 함. 호출자가 명시적으로 disable 하고 싶을 때도 활용.
    enabled: ticker.length > 0 && (options?.enabled ?? true),
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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

export function useStockMarketIndexHistory(
  days: number = 7,
  options?: { initialData?: StockMarketIndexHistoryResponse },
) {
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: stocksKeys.marketIndexHistory(days),
    queryFn: () => fetchStockMarketIndexHistory(days),
    staleTime: MARKET_INDEX_HISTORY_STALE_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
  const refetchInterval = useRealtimeRefetchInterval(
    MARKET_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: stocksKeys.marketWire(days, limit),
    queryFn: () => fetchStockMarketWire(days, limit),
    staleTime: MARKET_WIRE_STALE_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}

export function useStockBalance(
  characterId: string | null,
  options?: { initialData?: StockBalanceResponse },
) {
  return useCreditBalance(characterId, options);
}

export function useStockLedger(
  characterId: string | null,
  ticker: string,
  options?: { initialData?: StockLedgerResponse },
) {
  const initialData =
    characterId !== null &&
    options?.initialData?.hasMainCharacter === true &&
    options.initialData.characterId === characterId &&
    options.initialData.ticker === ticker
      ? options.initialData
      : undefined;
  return useQuery({
    queryKey: stockAccountKeys.ledger(characterId ?? "missing", ticker),
    queryFn: () => fetchStockLedger(ticker, characterId!),
    staleTime: STOCK_ACCOUNT_STALE_MS,
    enabled: characterId !== null && ticker.length > 0,
    initialData,
    refetchOnWindowFocus: true,
    retry: retryOwnedStockRead,
  });
}

export function useStockRealizedProfit(
  characterId: string | null,
  options?: { initialData?: StockRealizedProfitResponse },
) {
  const initialData =
    characterId !== null &&
    options?.initialData?.hasMainCharacter === true &&
    options.initialData.characterId === characterId
      ? options.initialData
      : undefined;
  return useQuery({
    queryKey: stockAccountKeys.realizedProfit(characterId ?? "missing"),
    queryFn: () => fetchStockRealizedProfit(characterId!),
    staleTime: STOCK_ACCOUNT_STALE_MS,
    enabled: characterId !== null,
    initialData,
    refetchOnWindowFocus: true,
    retry: retryOwnedStockRead,
  });
}
