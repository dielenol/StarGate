import type { ObjectId } from "mongodb";

/**
 * 주식 가격 시계열 스냅샷 (ticker 별 단일 문서).
 *
 * - price / prevPrice: 0.01 단위 숫자.
 * - lastUpdate: KST 'YYYY-MM-DD HH:mm' 문자열.
 *   UTC Date 가 아닌 문자열을 쓰는 이유는 KST 기준 표시 일관성 + 봇 호환.
 */
export interface StockPrice {
  _id?: ObjectId;
  ticker: string;
  price: number;
  prevPrice: number;
  eventText: string;
  lastUpdate: string;
}

export type CreateStockPriceInput = Omit<StockPrice, "_id">;

/**
 * 주식 보유량 (character × ticker).
 *
 * - shares < 0 금지 (CRUD 단계 atomic guard 로 강제).
 * - avgPrice: 가중평균 매수단가 (0.01 단위 반올림).
 *   newAvg = round((oldShares * oldAvg + buyShares * buyPrice) / (oldShares + buyShares), 2)
 *
 * characterId 는 Character._id.toHexString() (ObjectId 문자열).
 * (Phase 2 ledger 가 character 단위로 전환됨 → holdings 도 같은 키로 정합.)
 */
export interface StockHolding {
  _id?: ObjectId;
  characterId: string;
  ticker: string;
  shares: number;
  avgPrice: number;
  updatedAt: Date;
}

export type CreateStockHoldingInput = Omit<StockHolding, "_id">;

/**
 * 주식 가격 변동 시계열 로그 (ticker × event).
 *
 * - StockPrice 가 "현재 스냅샷" 이라면 본 컬렉션은 차트/이력 표시용 append-only.
 * - createdAt 기준 TTL 30 일 (`expireAfterSeconds: 30 * 24 * 60 * 60`).
 * - source: 가격 변동 사유 분류.
 *   - "scheduled": tia_bot 스케줄 갱신.
 *   - "trade": 매매로 인한 가격 변동.
 *   - "gm-event": GM 수동 이벤트 (폭락/폭등 등).
 */
export interface StockPriceHistory {
  _id?: ObjectId;
  ticker: string;
  price: number;
  prevPrice: number;
  eventText?: string;
  eventTier?: "routine" | "scenario" | "shock";
  source: "scheduled" | "trade" | "gm-event";
  createdAt: Date;
}

/**
 * append-only 시계열 입력. createdAt 은 CRUD 가 항상 now 로 부여 (호출자 주입 금지).
 *
 * 다른 컬렉션(예: createCreditTransaction) 과 동일하게 createdAt 도 Omit 대상.
 */
export type CreateStockPriceHistoryInput = Omit<
  StockPriceHistory,
  "_id" | "createdAt"
>;
