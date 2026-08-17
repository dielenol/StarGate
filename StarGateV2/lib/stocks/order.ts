/**
 * 주문 수량 규칙 SSOT — buy/sell 라우트와 거래 UI 가 함께 참조한다.
 *
 * 1회 주문 수량 상한(구 50주 하드캡)은 제거됐다. 실질 상한은 매수=잔액,
 * 매도=보유 수량이며, 두 경로 모두 트랜잭션 내부에서 재검증된다.
 * 여기 남은 검증은 "정수 · 1주 이상 · 금액 계산이 안전한 범위" 뿐이다.
 */

/** 1회 주문 최소 수량. */
export const MIN_ORDER_SHARES = 1;

/**
 * 계산 안전 상한 — 게임 밸런스 캡이 아니라 부동소수 정밀도 가드다.
 *
 * `roundStockValue(price * shares)` 가 안전 정수 범위를 넘지 않도록,
 * 최대 시세(MAX_STOCK_PRICE ≈ 1e9) 기준으로도 여유가 남는 값을 쓴다.
 * 잔액·보유 수량이 먼저 걸리므로 실사용에서 도달할 일은 없다.
 */
export const MAX_SAFE_ORDER_SHARES = 1_000_000_000;

/** 주문 수량이 정수·양수·안전범위인지 검증. */
export function isValidOrderShares(shares: unknown): shares is number {
  return (
    typeof shares === "number" &&
    Number.isSafeInteger(shares) &&
    shares >= MIN_ORDER_SHARES &&
    shares <= MAX_SAFE_ORDER_SHARES
  );
}

/** 주문 수량 검증 실패 시 사용자에게 보여줄 메시지. */
export const INVALID_ORDER_SHARES_MESSAGE = `shares는 ${MIN_ORDER_SHARES}주 이상의 정수여야 합니다.`;
