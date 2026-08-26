import type { NovexLifetimeReturnCandidate } from "@stargate/core";
import type { CreditTransaction } from "@stargate/shared-db/types";
import type { Db } from "mongodb";

/**
 * NOVEX 명예의 전당용 전 기간 실현손익 후보를 실제 Mongo 원장에서 계산한다.
 *
 * 거래 시점 ownerId와 현재 캐릭터 ownerId 모두 GM·테스트 계정이 아니어야 하며,
 * 숫자형 STOCK_SELL metadata.profit과 지급된 STOCK_DIVIDEND amount만 합산한다.
 */
export async function listStockLifetimeReturnCandidatesFromDb(
  db: Db,
): Promise<NovexLifetimeReturnCandidate[]> {
  return db
    .collection<CreditTransaction>("credit_transactions")
    .aggregate<NovexLifetimeReturnCandidate>([
      {
        $match: {
          type: { $in: ["STOCK_SELL", "STOCK_DIVIDEND"] },
        },
      },
      {
        $group: {
          _id: {
            characterId: "$characterId",
            ownerId: "$ownerId",
          },
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
          transactionOwnerObjectId: {
            $convert: {
              input: "$_id.ownerId",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { transactionOwnerObjectId: { $ne: null } } },
      {
        $lookup: {
          from: "users",
          localField: "transactionOwnerObjectId",
          foreignField: "_id",
          as: "transactionOwner",
        },
      },
      { $unwind: "$transactionOwner" },
      {
        $match: {
          $expr: {
            $and: [
              { $ne: ["$transactionOwner.role", "GM"] },
              {
                $not: [
                  {
                    $regexMatch: {
                      input: {
                        $toUpper: {
                          $trim: { input: "$transactionOwner.username" },
                        },
                      },
                      regex: "TEST$",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_id.characterId",
          totalRealizedReturn: { $sum: "$totalRealizedReturn" },
          profitEventCount: { $sum: "$profitEventCount" },
        },
      },
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
      { $match: { "character.type": "AGENT" } },
      {
        $set: {
          currentOwnerObjectId: {
            $convert: {
              input: "$character.ownerId",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { currentOwnerObjectId: { $ne: null } } },
      {
        $lookup: {
          from: "users",
          localField: "currentOwnerObjectId",
          foreignField: "_id",
          as: "currentOwner",
        },
      },
      { $unwind: "$currentOwner" },
      {
        $match: {
          $expr: {
            $and: [
              { $ne: ["$currentOwner.role", "GM"] },
              {
                $not: [
                  {
                    $regexMatch: {
                      input: {
                        $toUpper: {
                          $trim: { input: "$currentOwner.username" },
                        },
                      },
                      regex: "TEST$",
                    },
                  },
                ],
              },
            ],
          },
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
