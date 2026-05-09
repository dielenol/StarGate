/**
 * 주식 매수 / 매도 mutation hooks.
 *
 * - `useBuyStock`: POST /api/erp/stocks/buy — 시세 + 잔액 + 보유 3-step Saga.
 * - `useSellStock`: POST /api/erp/stocks/sell — 시세 + 보유 + 잔액 3-step Saga.
 *
 * 에러 — 서버 응답 `{ error, code }` 를 `StocksApiError` 로 wrap (UI 분기 가능).
 *
 * 성공 시 invalidate 정책 (M3-A: 매매가 가격에 영향 없음 → history 는 invalidate 제외):
 * - buy: prices(시세 표시 갱신) + holdings(보유 갱신) + creditKeys.all(잔액/ledger).
 * - sell: 동일 (history 는 변동 없음 — invalidate 비효율).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import {
  StocksApiError,
  type StocksErrorCode,
  isKnownStocksErrorCode,
  stocksKeys,
} from "@/hooks/queries/useStocksQuery";

/**
 * 자동 환불/복구가 발생한 에러 코드 — onSuccess 와 동일하게 holdings/credit 캐시를 무효화해야
 * UI 의 잔액/보유/ledger 가 실제 DB 상태와 일치한다. (실패는 했지만 ledger row 가 추가됨)
 */
const REFUND_AFFECTING_CODES: ReadonlySet<StocksErrorCode> = new Set([
  "HOLDING_FAILED_REFUNDED",
  "SELL_LEDGER_FAILED_RESTORED",
  "REFUND_FAILED",
  "RESTORE_FAILED",
]);

/* ── 입력/응답 타입 ── */

interface BuyInput {
  ticker: string;
  shares: number;
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

interface SellInput {
  ticker: string;
  shares: number;
}

interface SellResponse {
  sale: {
    ticker: string;
    name: string;
    shares: number;
    price: number;
    totalProceeds: number;
    profit: number;
  };
  balance: number;
  remainingShares: number;
}

/* ── 공통 에러 파서 ── */

async function throwStocksError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: unknown;
  };
  // 알려지지 않은 code 는 undefined 처리 (UI 분기 매핑 실패 → 일반 메시지 fallback).
  // useStocksQuery 의 parseStocksError 와 동일한 화이트리스트.
  throw new StocksApiError(
    body.error ?? "주식 요청에 실패했습니다.",
    res.status,
    isKnownStocksErrorCode(body.code) ? body.code : undefined,
  );
}

/* ── Hooks ── */

export function useBuyStock() {
  const queryClient = useQueryClient();

  return useMutation<BuyResponse, StocksApiError, BuyInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/stocks/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwStocksError(res);
      return res.json();
    },
    onSuccess: () => {
      // 시세 + 보유 + 잔액/ledger 모두 변동.
      // history 는 매매로 변동 없음 (M3-A: 가격 영향 무) → 제외.
      queryClient.invalidateQueries({ queryKey: stocksKeys.prices });
      queryClient.invalidateQueries({ queryKey: stocksKeys.holdings });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
    onError: (err) => {
      // 자동 환불/복구가 발생한 케이스도 ledger/holdings 가 변경됐으므로 invalidate.
      if (err.code && REFUND_AFFECTING_CODES.has(err.code)) {
        queryClient.invalidateQueries({ queryKey: stocksKeys.holdings });
        queryClient.invalidateQueries({ queryKey: creditKeys.all });
      }
    },
  });
}

export function useSellStock() {
  const queryClient = useQueryClient();

  return useMutation<SellResponse, StocksApiError, SellInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/erp/stocks/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) await throwStocksError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stocksKeys.prices });
      queryClient.invalidateQueries({ queryKey: stocksKeys.holdings });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
    onError: (err) => {
      if (err.code && REFUND_AFFECTING_CODES.has(err.code)) {
        queryClient.invalidateQueries({ queryKey: stocksKeys.holdings });
        queryClient.invalidateQueries({ queryKey: creditKeys.all });
      }
    },
  });
}
