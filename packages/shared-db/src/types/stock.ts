import type { ObjectId } from "mongodb";

/**
 * 주식 가격 시계열 스냅샷 (ticker 별 단일 문서).
 *
 * - price / prevPrice: 정수 (소수점 없음, tia_bot 봇 코드와 정합).
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
 * 주식 보유량 (user × ticker).
 *
 * - shares < 0 금지 (CRUD 단계 atomic guard 로 강제).
 * - avgPrice: 가중평균 매수단가 (정수 절사).
 *   newAvg = floor((oldShares * oldAvg + buyShares * buyPrice) / (oldShares + buyShares))
 *
 * userId 는 User._id.toHexString() (ObjectId 문자열).
 */
export interface StockHolding {
  _id?: ObjectId;
  userId: string;
  ticker: string;
  shares: number;
  avgPrice: number;
  updatedAt: Date;
}

export type CreateStockHoldingInput = Omit<StockHolding, "_id">;
