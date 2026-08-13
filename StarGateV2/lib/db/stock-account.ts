/**
 * 주식 화면 전용 credit ledger 읽기 모델.
 *
 * 전체 크레딧 원장을 가져온 뒤 클라이언트에서 자르는 대신, 주식 화면이 실제로
 * 소비하는 행과 집계만 MongoDB에서 읽는다. 모든 함수는 characterId로 범위가
 * 고정된 read-only 조회이며 경제 상태를 변경하지 않는다.
 */

import "./init";

import { getDb } from "@stargate/shared-db";

import type { CreditTransaction } from "@stargate/shared-db/types";

export type StockLedgerTransaction = Pick<
  CreditTransaction,
  "_id" | "amount" | "balance" | "createdAt"
> & {
  type: "STOCK_BUY" | "STOCK_SELL";
  metadata?: {
    ticker?: string;
    shares?: number;
    price?: number;
    profit?: number;
  };
};

export interface StockRealizedProfitSummary {
  /** 숫자 metadata.profit을 가진 STOCK_SELL 원장의 전체 합계. */
  realizedProfit: number;
  /** 실현손익 합계에 포함된 STOCK_SELL 원장 수. */
  countedSales: number;
  /** 해당 캐릭터의 전체 STOCK_SELL 원장 수. */
  totalSales: number;
}

/** ticker별 최근 매수·매도 원장. createdAt 동률은 _id 내림차순으로 결정한다. */
export async function listRecentStockLedger(
  characterId: string,
  ticker: string,
  limit = 5,
): Promise<StockLedgerTransaction[]> {
  const db = await getDb();
  return db
    .collection<CreditTransaction>("credit_transactions")
    .find(
      {
        characterId,
        type: { $in: ["STOCK_BUY", "STOCK_SELL"] },
        "metadata.ticker": ticker,
      },
      {
        projection: {
          _id: 1,
          type: 1,
          amount: 1,
          balance: 1,
          "metadata.ticker": 1,
          "metadata.shares": 1,
          "metadata.price": 1,
          "metadata.profit": 1,
          createdAt: 1,
        },
      },
    )
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray() as Promise<StockLedgerTransaction[]>;
}

/**
 * 전체 기간 실현손익.
 *
 * 정의: characterId의 모든 STOCK_SELL 중 숫자형 metadata.profit의 합계다.
 * 레거시/비정상 행처럼 profit이 숫자가 아닌 매도는 합계에서 제외하되, 호출자가
 * 데이터 완전성을 판단할 수 있도록 totalSales와 countedSales를 함께 반환한다.
 */
export async function getStockRealizedProfitSummary(
  characterId: string,
): Promise<StockRealizedProfitSummary> {
  const db = await getDb();
  const [summary] = await db
    .collection<CreditTransaction>("credit_transactions")
    .aggregate<StockRealizedProfitSummary>([
      { $match: { characterId, type: "STOCK_SELL" } },
      {
        $group: {
          _id: null,
          realizedProfit: {
            $sum: {
              $cond: [
                { $isNumber: "$metadata.profit" },
                "$metadata.profit",
                0,
              ],
            },
          },
          countedSales: {
            $sum: { $cond: [{ $isNumber: "$metadata.profit" }, 1, 0] },
          },
          totalSales: { $sum: 1 },
        },
      },
      { $project: { _id: 0, realizedProfit: 1, countedSales: 1, totalSales: 1 } },
    ])
    .toArray();

  return summary ?? { realizedProfit: 0, countedSales: 0, totalSales: 0 };
}
