/**
 * 주식 화면 전용 credit ledger 읽기 모델.
 *
 * 전체 크레딧 원장을 가져온 뒤 클라이언트에서 자르는 대신, 주식 화면이 실제로
 * 소비하는 행과 집계만 MongoDB에서 읽는다. 모든 함수는 characterId로 범위가
 * 고정된 read-only 조회이며 경제 상태를 변경하지 않는다.
 */

import "./init";

import { getDb } from "@stargate/shared-db";

import {
  isNovexHallExcludedAccount,
  type NovexLifetimeReturnCandidate,
} from "@stargate/core";
import type { CreditTransaction, User } from "@stargate/shared-db/types";

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

/**
 * NOVEX 명예의 전당용 전 기간 실현손익 후보.
 *
 * 숫자형 metadata.profit이 있는 STOCK_SELL과 지급된 STOCK_DIVIDEND amount를
 * 확정 수익에 포함한다. 거래 시점 ownerId가 GM·테스트 계정인 원장은 캐릭터별
 * 집계 전에 제외해 이후 캐릭터 소유권 변경이 과거 공적 귀속을 바꾸지 않는다.
 * 최종 TOP 3 정렬은 core의 단일 도메인 함수가 담당한다.
 */
export async function listStockLifetimeReturnCandidates(): Promise<
  NovexLifetimeReturnCandidate[]
> {
  const db = await getDb();
  const owners = await db
    .collection<User>("users")
    .find(
      {},
      {
        projection: {
          _id: 1,
          username: 1,
          role: 1,
        },
      },
    )
    .toArray();
  const eligibleOwnerIds = owners
    .filter(
      (owner) =>
        owner._id &&
        !isNovexHallExcludedAccount({
          username: owner.username,
          role: owner.role,
        }),
    )
    .map((owner) => String(owner._id));
  if (eligibleOwnerIds.length === 0) return [];

  return db
    .collection<CreditTransaction>("credit_transactions")
    .aggregate<NovexLifetimeReturnCandidate>([
      {
        $match: {
          type: { $in: ["STOCK_SELL", "STOCK_DIVIDEND"] },
          ownerId: { $in: eligibleOwnerIds },
        },
      },
      {
        $group: {
          _id: "$characterId",
          totalRealizedReturn: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $eq: ["$type", "STOCK_SELL"] },
                        { $isNumber: "$metadata.profit" },
                      ],
                    },
                    then: "$metadata.profit",
                  },
                  {
                    case: {
                      $and: [
                        { $eq: ["$type", "STOCK_DIVIDEND"] },
                        { $isNumber: "$amount" },
                      ],
                    },
                    then: "$amount",
                  },
                ],
                default: 0,
              },
            },
          },
          profitEventCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    {
                      $and: [
                        { $eq: ["$type", "STOCK_SELL"] },
                        { $isNumber: "$metadata.profit" },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ["$type", "STOCK_DIVIDEND"] },
                        { $isNumber: "$amount" },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $match: { profitEventCount: { $gt: 0 } } },
      {
        $set: {
          characterObjectId: {
            $convert: {
              input: "$_id",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { characterObjectId: { $ne: null } } },
      {
        $lookup: {
          from: "characters",
          localField: "characterObjectId",
          foreignField: "_id",
          as: "character",
        },
      },
      { $unwind: "$character" },
      {
        $match: {
          "character.type": "AGENT",
          "character.ownerId": { $in: eligibleOwnerIds },
        },
      },
      {
        $project: {
          _id: 0,
          characterId: "$_id",
          codename: "$character.codename",
          totalRealizedReturn: 1,
          profitEventCount: 1,
        },
      },
    ])
    .toArray();
}
