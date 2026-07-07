/**
 * stock 섹션 공용 헬퍼 (방향/에러 메시지 등).
 *
 * - `/erp/stock` (list) 와 `/erp/stock/[ticker]` (trade) 가 동일 변환 규칙을 공유한다.
 * - client/server 양쪽에서 사용 가능 — Mongo / "server-only" 의존성 없음.
 */

import {
  StocksApiError,
  type StocksErrorCode,
} from "@/hooks/queries/useStocksQuery";

import { describeApiError } from "@/lib/api/describe-error";

/* ── 방향 ── */

export type Direction = "up" | "down" | "flat";

export const ARROW: Record<Direction, string> = {
  up: "▲",
  down: "▼",
  flat: "·",
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: "상승",
  down: "하락",
  flat: "보합",
};

export function priceDirection(price: number, prev: number): Direction {
  if (price > prev) return "up";
  if (price < prev) return "down";
  return "flat";
}

export function profitDirection(profit: number): Direction {
  if (profit > 0) return "up";
  if (profit < 0) return "down";
  return "flat";
}

/* ── 에러 메시지 ── */

export const ERROR_MESSAGE: Record<StocksErrorCode, string> = {
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  PRICE_NOT_FOUND: "종목 시세를 찾을 수 없습니다.",
  MARKET_CLOSED: "현재 주식 거래가 일시 중지되어 있습니다.",
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  INSUFFICIENT_SHARES: "보유 주식이 부족합니다.",
  REFUND_FAILED:
    "매수 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  HOLDING_FAILED_REFUNDED:
    "매수에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  SELL_LEDGER_FAILED_RESTORED:
    "매도에 실패했습니다. 차감된 보유량은 자동 복구되었습니다.",
  RESTORE_FAILED:
    "매도 실패 + 보유량 복구 실패. 운영자(GM)에게 문의해 보유량 정정을 요청하세요.",
};

export function describeStocksError(err: unknown): string {
  return describeApiError(err, StocksApiError, ERROR_MESSAGE);
}
