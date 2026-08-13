import type { ClientSession, Collection } from "mongodb";

import { getDb } from "../client.js";
import type {
  StockScheduledEvent,
  StockScheduledEventActor,
  StockScheduledEventStatus,
  StockScheduledEventTier,
} from "../types/stock-scheduled-event.js";

const COLLECTION = "stock_scheduled_events";

interface StockPriceScheduleFence {
  ticker: string;
  scheduledEventRevision?: number;
}

async function scheduledEventsCol(): Promise<Collection<StockScheduledEvent>> {
  const db = await getDb();
  return db.collection<StockScheduledEvent>(COLLECTION);
}

export function stockScheduledEventId(kstDate: string, ticker: string): string {
  return `stock-event:${kstDate}:${ticker}`;
}

export class StockScheduledEventConflictError extends Error {
  readonly status: StockScheduledEventStatus;

  constructor(status: StockScheduledEventStatus) {
    super(`STOCK_SCHEDULED_EVENT_${status}`);
    this.name = "StockScheduledEventConflictError";
    this.status = status;
  }
}

export class StockScheduledEventNotFoundError extends Error {
  constructor() {
    super("STOCK_SCHEDULED_EVENT_NOT_FOUND");
    this.name = "StockScheduledEventNotFoundError";
  }
}

export class StockScheduledEventCreationError extends Error {
  readonly code: "CUTOFF_REACHED" | "PRICE_NOT_FOUND";

  constructor(code: "CUTOFF_REACHED" | "PRICE_NOT_FOUND") {
    super(`STOCK_SCHEDULED_EVENT_${code}`);
    this.name = "StockScheduledEventCreationError";
    this.code = code;
  }
}

/**
 * 예약 생성과 같은 ticker의 정기 tick을 stock_prices 문서 write로 직렬화한다.
 * transaction retry마다 현재 시각을 다시 주입해야 cutoff 뒤 늦은 commit을 막을 수 있다.
 */
export async function fenceStockScheduledEventCreation(input: {
  ticker: string;
  executeAt: Date;
  now: Date;
  session: ClientSession;
}): Promise<void> {
  if (input.now.getTime() >= input.executeAt.getTime()) {
    throw new StockScheduledEventCreationError("CUTOFF_REACHED");
  }

  const db = await getDb();
  const prices = db.collection<StockPriceScheduleFence>("stock_prices");
  const fenced = await prices.findOneAndUpdate(
    { ticker: input.ticker },
    { $inc: { scheduledEventRevision: 1 } },
    { returnDocument: "after", session: input.session },
  );
  if (!fenced) {
    throw new StockScheduledEventCreationError("PRICE_NOT_FOUND");
  }
}

export interface CreateStockScheduledEventInput {
  ticker: string;
  kstDate: string;
  executeAt: Date;
  changePercent: number;
  eventText: string;
  eventTier: StockScheduledEventTier;
  actor: StockScheduledEventActor;
  now: Date;
}

/**
 * ticker/date 결정적 ID로 중복 예약을 차단한다. CANCELLED 문서만 같은 슬롯에서
 * 재활성화할 수 있고, PENDING/APPLIED lifecycle은 덮어쓰지 않는다.
 */
export async function createStockScheduledEvent(
  input: CreateStockScheduledEventInput,
  session: ClientSession,
): Promise<StockScheduledEvent> {
  const col = await scheduledEventsCol();
  const id = stockScheduledEventId(input.kstDate, input.ticker);
  const doc: StockScheduledEvent = {
    _id: id,
    ticker: input.ticker,
    kstDate: input.kstDate,
    executeAt: input.executeAt,
    changePercent: input.changePercent,
    eventText: input.eventText,
    eventTier: input.eventTier,
    status: "PENDING",
    createdBy: input.actor,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const mutableDoc = {
    ticker: doc.ticker,
    kstDate: doc.kstDate,
    executeAt: doc.executeAt,
    changePercent: doc.changePercent,
    eventText: doc.eventText,
    eventTier: doc.eventTier,
    status: doc.status,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  const reactivated = await col.findOneAndUpdate(
    { _id: id, status: "CANCELLED" },
    {
      $set: mutableDoc,
      $unset: {
        cancelledBy: "",
        cancelledAt: "",
        appliedAt: "",
        appliedOperationKey: "",
      },
    },
    { returnDocument: "after", session },
  );
  if (reactivated) return reactivated;

  const existing = await col.findOne({ _id: id }, { session });
  if (existing) throw new StockScheduledEventConflictError(existing.status);

  await col.insertOne(doc, { session });
  return doc;
}

export async function listStockScheduledEvents(input: {
  from: Date;
  historyLimit?: number;
}): Promise<StockScheduledEvent[]> {
  const col = await scheduledEventsCol();
  const historyLimit = Math.min(
    200,
    Math.max(1, input.historyLimit ?? 100),
  );
  const [pending, history] = await Promise.all([
    col
      .find({ status: "PENDING" })
      .sort({ executeAt: 1, ticker: 1 })
      .toArray(),
    col
      .find({
        status: { $in: ["APPLIED", "CANCELLED"] },
        executeAt: { $gte: input.from },
      })
      .sort({ executeAt: -1, ticker: -1 })
      .limit(historyLimit)
      .toArray(),
  ]);
  return [...pending, ...history];
}

/** 가격/history transaction 안에서만 호출해 이벤트 소비도 함께 commit한다. */
export async function claimPendingStockScheduledEvent(input: {
  ticker: string;
  kstDate: string;
  operationKey: string;
  now: Date;
  session: ClientSession;
}): Promise<StockScheduledEvent | null> {
  const col = await scheduledEventsCol();
  return col.findOneAndUpdate(
    {
      _id: stockScheduledEventId(input.kstDate, input.ticker),
      status: "PENDING",
      executeAt: { $lte: input.now },
    },
    {
      $set: {
        status: "APPLIED",
        appliedAt: input.now,
        appliedOperationKey: input.operationKey,
        updatedAt: input.now,
      },
    },
    { returnDocument: "after", session: input.session },
  );
}

export async function cancelStockScheduledEvent(input: {
  eventId: string;
  actor: StockScheduledEventActor;
  now: Date;
  session: ClientSession;
}): Promise<StockScheduledEvent> {
  const col = await scheduledEventsCol();
  const cancelled = await col.findOneAndUpdate(
    { _id: input.eventId, status: "PENDING" },
    {
      $set: {
        status: "CANCELLED",
        cancelledBy: input.actor,
        cancelledAt: input.now,
        updatedAt: input.now,
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (cancelled) return cancelled;

  const existing = await col.findOne(
    { _id: input.eventId },
    { session: input.session },
  );
  if (!existing) throw new StockScheduledEventNotFoundError();
  throw new StockScheduledEventConflictError(existing.status);
}
