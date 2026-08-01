import {
  MongoServerError,
  type ClientSession,
} from "mongodb";

import { mrBeastSodaStockImpactDemandCol } from "../collections.js";
import type { MrBeastSodaStockImpactDemand } from "../types/stock.js";

const PROMOTION = "mrbeast-soda-stm-v1" as const;
const TICKER = "STM" as const;

export interface MrBeastSodaStockImpactDemandKey {
  eventId: string;
  configVersion: number;
  startAt: Date;
  endAt: Date;
}

export class MrBeastSodaStockImpactDemandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MrBeastSodaStockImpactDemandError";
  }
}

function demandId(key: MrBeastSodaStockImpactDemandKey): string {
  return `${PROMOTION}:${key.eventId}:v${key.configVersion}`;
}

function validKey(key: MrBeastSodaStockImpactDemandKey): boolean {
  return (
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key.eventId) &&
    Number.isSafeInteger(key.configVersion) &&
    key.configVersion >= 1 &&
    key.startAt instanceof Date &&
    !Number.isNaN(key.startAt.getTime()) &&
    key.endAt instanceof Date &&
    !Number.isNaN(key.endAt.getTime()) &&
    key.startAt.getTime() < key.endAt.getTime()
  );
}

function matchesKey(
  demand: MrBeastSodaStockImpactDemand,
  key: MrBeastSodaStockImpactDemandKey,
): boolean {
  return (
    demand._id === demandId(key) &&
    demand.promotion === PROMOTION &&
    demand.ticker === TICKER &&
    demand.eventId === key.eventId &&
    demand.configVersion === key.configVersion &&
    demand.startAt.getTime() === key.startAt.getTime() &&
    demand.endAt.getTime() === key.endAt.getTime()
  );
}

export async function prepareMrBeastSodaStockImpactDemand(
  key: MrBeastSodaStockImpactDemandKey,
): Promise<void> {
  if (!validKey(key)) {
    throw new MrBeastSodaStockImpactDemandError(
      "미스터비스트 소다 주가 영향 설정이 올바르지 않습니다.",
    );
  }
  const collection = await mrBeastSodaStockImpactDemandCol();
  const now = new Date();
  try {
    await collection.updateOne(
      {
        _id: demandId(key),
        promotion: PROMOTION,
        ticker: TICKER,
        eventId: key.eventId,
        configVersion: key.configVersion,
        startAt: key.startAt,
        endAt: key.endAt,
      },
      {
        $setOnInsert: {
          soldQuantity: 0,
          appliedQuantity: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }
  }

  const prepared = await collection.findOne({ _id: demandId(key) });
  if (!prepared || !matchesKey(prepared, key)) {
    throw new MrBeastSodaStockImpactDemandError(
      "미스터비스트 소다 주가 영향 원장의 정합성을 확인할 수 없습니다.",
    );
  }
}

export async function incrementMrBeastSodaStockImpactDemand(input: {
  key: MrBeastSodaStockImpactDemandKey;
  quantity: number;
  purchasedAt: Date;
  session: ClientSession;
}): Promise<void> {
  if (!input.session.inTransaction()) {
    throw new Error("Stock impact demand requires an active transaction");
  }
  if (
    !validKey(input.key) ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    Number.isNaN(input.purchasedAt.getTime()) ||
    input.purchasedAt.getTime() < input.key.startAt.getTime() ||
    input.purchasedAt.getTime() >= input.key.endAt.getTime()
  ) {
    throw new MrBeastSodaStockImpactDemandError(
      "미스터비스트 소다 주가 영향 판매량이 허용 범위를 벗어났습니다.",
    );
  }

  const result = await (await mrBeastSodaStockImpactDemandCol()).updateOne(
    {
      _id: demandId(input.key),
      promotion: PROMOTION,
      ticker: TICKER,
      eventId: input.key.eventId,
      configVersion: input.key.configVersion,
      startAt: input.key.startAt,
      endAt: input.key.endAt,
      soldQuantity: { $gte: 0 },
      appliedQuantity: { $gte: 0 },
      $expr: { $gte: ["$soldQuantity", "$appliedQuantity"] },
    },
    {
      $inc: { soldQuantity: input.quantity },
      $set: { updatedAt: input.purchasedAt },
    },
    { session: input.session },
  );
  if (result.matchedCount !== 1) {
    throw new MrBeastSodaStockImpactDemandError(
      "미스터비스트 소다 주가 영향 판매량을 기록하지 못했습니다.",
    );
  }
}

export async function consumeMrBeastSodaStockImpactDemand(input: {
  operationKey: string;
  now: Date;
  session: ClientSession;
}): Promise<{ soldQuantity: number; eventIds: string[] }> {
  if (!input.session.inTransaction()) {
    throw new Error("Stock impact demand requires an active transaction");
  }
  if (!input.operationKey.trim() || Number.isNaN(input.now.getTime())) {
    throw new MrBeastSodaStockImpactDemandError(
      "미스터비스트 소다 주가 영향 적용 요청이 올바르지 않습니다.",
    );
  }

  const collection = await mrBeastSodaStockImpactDemandCol();
  const demands = await collection
    .find(
      {
        promotion: PROMOTION,
        ticker: TICKER,
        startAt: { $lte: input.now },
        $expr: { $gt: ["$soldQuantity", "$appliedQuantity"] },
      },
      { session: input.session },
    )
    .sort({ startAt: 1, _id: 1 })
    .toArray();

  let soldQuantity = 0;
  const eventIds: string[] = [];
  for (const demand of demands) {
    if (
      !Number.isSafeInteger(demand.soldQuantity) ||
      !Number.isSafeInteger(demand.appliedQuantity) ||
      demand.soldQuantity < demand.appliedQuantity ||
      demand.appliedQuantity < 0
    ) {
      throw new MrBeastSodaStockImpactDemandError(
        "미스터비스트 소다 주가 영향 원장의 수량이 올바르지 않습니다.",
      );
    }
    const pendingQuantity = demand.soldQuantity - demand.appliedQuantity;
    if (!Number.isSafeInteger(soldQuantity + pendingQuantity)) {
      throw new MrBeastSodaStockImpactDemandError(
        "미스터비스트 소다 주가 영향 판매량 합계가 너무 큽니다.",
      );
    }
    const updated = await collection.updateOne(
      {
        _id: demand._id,
        soldQuantity: demand.soldQuantity,
        appliedQuantity: demand.appliedQuantity,
      },
      {
        $set: {
          appliedQuantity: demand.soldQuantity,
          lastAppliedAt: input.now,
          lastAppliedOperationKey: input.operationKey,
          updatedAt: input.now,
        },
      },
      { session: input.session },
    );
    if (updated.matchedCount !== 1) {
      throw new MrBeastSodaStockImpactDemandError(
        "미스터비스트 소다 주가 영향 판매량을 원자적으로 적용하지 못했습니다.",
      );
    }
    soldQuantity += pendingQuantity;
    eventIds.push(demand.eventId);
  }

  return { soldQuantity, eventIds: [...new Set(eventIds)] };
}
