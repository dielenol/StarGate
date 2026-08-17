import { MongoServerError } from "mongodb";
import type { ClientSession, Collection } from "mongodb";

import { getDb } from "../client.js";
import type {
  StockScheduledEvent,
  StockScheduledEventActor,
  StockScheduledEventStatus,
  StockScheduledEventTier,
} from "../types/stock-scheduled-event.js";
import type { StockDisclosure } from "../types/stock-market.js";

const COLLECTION = "stock_scheduled_events";
const DISCLOSURES_COLLECTION = "stock_disclosures";
const DISCLOSURE_FENCES_COLLECTION = "stock_disclosure_effect_fences";
const MIGRATION_READINESS_COLLECTION = "stock_market_migration_readiness";

type StockScheduledEventCutoverOperation = "CREATE" | "CANCEL";

interface StockScheduledEventCutoverFence {
  _id: "novex-2";
  version: 2;
  status: "PRE_MIGRATION" | "APPLYING" | "READY" | "BLOCKED";
  attemptId: string;
  sourcePlanFingerprint: string;
  startedAt: Date;
  updatedAt: Date;
  legacyWriterRevision?: number;
}

interface StockPriceScheduleFence {
  ticker: string;
  scheduledEventRevision?: number;
}

async function scheduledEventsCol(): Promise<Collection<StockScheduledEvent>> {
  const db = await getDb();
  return db.collection<StockScheduledEvent>(COLLECTION);
}

async function fenceMigratedDisclosure(
  disclosure: StockDisclosure,
  session: ClientSession,
): Promise<void> {
  if (!disclosure.slotKey || !disclosure.publishAt) {
    throw new Error(
      `MIGRATED_STOCK_DISCLOSURE_SLOT_MISSING:${disclosure._id}`,
    );
  }
  const db = await getDb();
  await db.collection<{ _id: string; revision: number }>(
    DISCLOSURE_FENCES_COLLECTION,
  ).updateOne(
    { _id: disclosure.slotKey },
    { $inc: { revision: 1 } },
    { upsert: true, session },
  );
}

function effectiveNow(requestedAt: Date): Date {
  return new Date(Math.max(requestedAt.getTime(), Date.now()));
}

async function reactivateMigratedDisclosure(
  event: StockScheduledEvent,
  requestedAt: Date,
  session: ClientSession,
): Promise<void> {
  if (!event.migratedDisclosureId) return;
  const db = await getDb();
  const disclosures = db.collection<StockDisclosure>(DISCLOSURES_COLLECTION);
  const disclosure = await disclosures.findOne(
    { _id: event.migratedDisclosureId },
    { session },
  );
  if (!disclosure) {
    throw new Error(
      `MIGRATED_STOCK_DISCLOSURE_NOT_FOUND:${event.migratedDisclosureId}`,
    );
  }
  await fenceMigratedDisclosure(disclosure, session);
  const now = effectiveNow(requestedAt);
  if (!disclosure.publishAt || disclosure.publishAt.getTime() <= now.getTime()) {
    throw new StockScheduledEventCreationError("CUTOFF_REACHED");
  }
  const saved = await disclosures.findOneAndUpdate(
    {
      _id: disclosure._id,
      status: { $in: ["CANCELLED", "SCHEDULED"] },
      publishAt: { $gt: now },
    },
    {
      $set: {
        title: `${event.ticker} 예약 공시`,
        body: event.eventText,
        kind: "PRICE",
        status: "SCHEDULED",
        source: "GM",
        effects: [
          {
            scope: "TICKER",
            ticker: event.ticker,
            changePercent: event.changePercent,
            structural: false,
          },
        ],
        shock: event.eventTier === "shock",
        updatedAt: now,
      },
      $unset: { cancelledAt: "", publishedAt: "" },
    },
    { returnDocument: "after", session },
  );
  if (!saved) {
    throw new StockScheduledEventConflictError("APPLIED");
  }
}

async function cancelMigratedDisclosure(
  event: StockScheduledEvent,
  requestedAt: Date,
  session: ClientSession,
): Promise<Date> {
  if (!event.migratedDisclosureId) return requestedAt;
  const db = await getDb();
  const disclosures = db.collection<StockDisclosure>(DISCLOSURES_COLLECTION);
  const disclosure = await disclosures.findOne(
    { _id: event.migratedDisclosureId },
    { session },
  );
  if (!disclosure) {
    throw new Error(
      `MIGRATED_STOCK_DISCLOSURE_NOT_FOUND:${event.migratedDisclosureId}`,
    );
  }
  if (disclosure.status === "CANCELLED") return requestedAt;
  if (disclosure.status !== "SCHEDULED") {
    throw new StockScheduledEventConflictError("APPLIED");
  }
  await fenceMigratedDisclosure(disclosure, session);
  const now = effectiveNow(requestedAt);
  const cancelled = await disclosures.updateOne(
    {
      _id: disclosure._id,
      status: "SCHEDULED",
      publishAt: { $gt: now },
    },
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: now,
        updatedAt: now,
      },
    },
    { session },
  );
  if (cancelled.modifiedCount !== 1) {
    throw new StockScheduledEventConflictError("APPLIED");
  }
  return now;
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

export class StockScheduledEventCutoverError extends Error {
  readonly code = "NOVEX_CUTOVER_LEGACY_WRITER_BLOCKED";
  readonly operation: StockScheduledEventCutoverOperation;

  constructor(operation: StockScheduledEventCutoverOperation) {
    super("NOVEX_CUTOVER_LEGACY_WRITER_BLOCKED");
    this.name = "StockScheduledEventCutoverError";
    this.operation = operation;
  }
}

/**
 * legacy 예약 writer와 NOVEX-2 migration claim을 같은 readiness 문서 write로
 * 직렬화한다. CREATE는 전환 전만 허용하고, CANCEL은 전환 전 또는 변환이 끝난
 * READY 상태에서만 허용한다. APPLYING/BLOCKED는 복구 판단 전까지 fail closed다.
 */
export async function fenceStockScheduledEventCutover(input: {
  operation: StockScheduledEventCutoverOperation;
  now: Date;
  session: ClientSession;
}): Promise<void> {
  const db = await getDb();
  const allowedStatus = input.operation === "CREATE"
    ? "PRE_MIGRATION" as const
    : { $in: ["PRE_MIGRATION", "READY"] as const };
  try {
    const fenced = await db.collection<StockScheduledEventCutoverFence>(
      MIGRATION_READINESS_COLLECTION,
    ).updateOne(
      { _id: "novex-2", status: allowedStatus },
      {
        $set: { updatedAt: input.now },
        $setOnInsert: {
          version: 2,
          status: "PRE_MIGRATION",
          // PRE_MIGRATION은 migration attempt가 아니지만 기존 marker serializer와
          // 운영 출력 계약을 깨지 않도록 명시적인 sentinel을 보관한다.
          attemptId: "legacy-writer-fence",
          sourcePlanFingerprint: "legacy-writer-fence",
          startedAt: input.now,
        },
        $inc: { legacyWriterRevision: 1 },
      },
      { upsert: true, session: input.session },
    );
    if (fenced.matchedCount + fenced.upsertedCount !== 1) {
      throw new StockScheduledEventCutoverError(input.operation);
    }
  } catch (error) {
    if (error instanceof StockScheduledEventCutoverError) throw error;
    // 동일 _id의 APPLYING/READY/BLOCKED marker가 filter에서 제외되면 upsert가
    // duplicate-key로 종료된다. 이를 안정적인 도메인 conflict로 변환한다.
    if (error instanceof MongoServerError && error.code === 11_000) {
      throw new StockScheduledEventCutoverError(input.operation);
    }
    throw error;
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
  await fenceStockScheduledEventCutover({
    operation: "CREATE",
    now: input.now,
    session,
  });
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
  if (reactivated) {
    await reactivateMigratedDisclosure(reactivated, input.now, session);
    return reactivated;
  }

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
  const claimed = await col.findOneAndUpdate(
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
  if (claimed?.migratedDisclosureId) {
    const db = await getDb();
    const disclosures = db.collection<StockDisclosure>(DISCLOSURES_COLLECTION);
    const disclosure = await disclosures.findOne(
      { _id: claimed.migratedDisclosureId },
      { session: input.session },
    );
    if (disclosure?.status === "SCHEDULED") {
      await fenceMigratedDisclosure(disclosure, input.session);
    }
    await disclosures.updateOne(
      { _id: claimed.migratedDisclosureId, status: "SCHEDULED" },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt: input.now,
          updatedAt: input.now,
        },
      },
      { session: input.session },
    );
  }
  return claimed;
}

export async function cancelStockScheduledEvent(input: {
  eventId: string;
  actor: StockScheduledEventActor;
  now: Date;
  session: ClientSession;
}): Promise<StockScheduledEvent> {
  await fenceStockScheduledEventCutover({
    operation: "CANCEL",
    now: input.now,
    session: input.session,
  });
  const col = await scheduledEventsCol();
  const current = await col.findOne(
    { _id: input.eventId },
    { session: input.session },
  );
  if (!current) throw new StockScheduledEventNotFoundError();
  if (current.status !== "PENDING") {
    throw new StockScheduledEventConflictError(current.status);
  }
  const cancelledAt = await cancelMigratedDisclosure(
    current,
    input.now,
    input.session,
  );
  const cancelled = await col.findOneAndUpdate(
    { _id: input.eventId, status: "PENDING" },
    {
      $set: {
        status: "CANCELLED",
        cancelledBy: input.actor,
        cancelledAt,
        updatedAt: cancelledAt,
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
