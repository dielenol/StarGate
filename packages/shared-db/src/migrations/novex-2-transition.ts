import { createHash, randomUUID } from "node:crypto";

import type { ClientSession, Db, IndexDescription } from "mongodb";

import { NOVEX_INDEX_DEFINITIONS } from "../indexes.js";
import type { StockScheduledEvent } from "../types/stock-scheduled-event.js";
import type { StockDisclosure } from "../types/stock-market.js";

export interface Novex2MigrationPlan {
  ttlIndexPresent: boolean;
  ttlIndexNames: string[];
  ttlIndexSpecs: Novex2TtlIndexSpec[];
  pricesWithoutReferencePrice: number;
  referencePriceBackfillSpecs: Novex2ReferencePriceBackfillSpec[];
  indexesToCreate: string[];
  indexSpecs: Novex2IndexPlanSpec[];
  uniqueIndexChecks: Novex2UniqueIndexCheck[];
  legacyPendingEventSpecs: Novex2LegacyPendingEventSpec[];
  legacyPendingPriceEffectConflicts: Novex2LegacyPriceEffectConflict[];
  legacyPendingEvents: number;
  legacyPendingEventsAlreadyConverted: number;
  legacyPendingEventsToConvert: number;
}

export interface NormalizedIndexSpec {
  key: unknown;
  unique: boolean;
  sparse: boolean;
  partialFilterExpression: unknown;
  expireAfterSeconds: number | null;
  collation: unknown;
}

export interface Novex2TtlIndexSpec {
  name: string;
  actual: NormalizedIndexSpec;
}

export interface Novex2UniqueIndexCheck {
  collection: string;
  name: string;
  duplicateGroups: number;
}

export interface Novex2LegacyPendingEventSpec {
  id: string;
  contentHash: string;
  ticker: string;
  targetSlotKey: string;
}

export interface Novex2LegacyPriceEffectConflict {
  ticker: string;
  targetSlotKey: string;
  legacyEventIds: string[];
  existingDisclosureIds: string[];
}

export function findNovex2LegacyPriceEffectConflicts(
  targets: readonly Novex2LegacyPendingEventSpec[],
  disclosures: readonly Pick<StockDisclosure, "_id" | "slotKey" | "effects">[],
): Novex2LegacyPriceEffectConflict[] {
  const conflictGroups = new Map<string, Novex2LegacyPriceEffectConflict>();
  for (const target of targets) {
    const key = `${target.targetSlotKey}\u0000${target.ticker}`;
    const group = conflictGroups.get(key) ?? {
      ticker: target.ticker,
      targetSlotKey: target.targetSlotKey,
      legacyEventIds: [],
      existingDisclosureIds: [],
    };
    group.legacyEventIds.push(target.id);
    conflictGroups.set(key, group);
  }
  for (const disclosure of disclosures) {
    if (!disclosure.slotKey) continue;
    for (const effect of disclosure.effects) {
      if (effect.scope !== "TICKER" || !effect.ticker) continue;
      const key = `${disclosure.slotKey}\u0000${effect.ticker}`;
      const group = conflictGroups.get(key);
      if (group) group.existingDisclosureIds.push(disclosure._id);
    }
  }
  return [...conflictGroups.values()]
    .filter((group) =>
      group.legacyEventIds.length > 1 || group.existingDisclosureIds.length > 0,
    )
    .map((group) => ({
      ...group,
      legacyEventIds: [...group.legacyEventIds].sort(),
      existingDisclosureIds: [...new Set(group.existingDisclosureIds)].sort(),
    }))
    .sort((left, right) =>
      `${left.targetSlotKey}:${left.ticker}`.localeCompare(
        `${right.targetSlotKey}:${right.ticker}`,
      ),
    );
}

export interface Novex2ReferencePriceBackfillSpec {
  ticker: string;
  price: number;
}

export interface Novex2IndexPlanSpec {
  collection: string;
  name: string;
  action: "CREATE" | "RECREATE";
  expected: NormalizedIndexSpec;
  actual?: NormalizedIndexSpec;
}

export interface Novex2MigrationResult {
  referencePricesBackfilled: number;
  legacyPendingEventsConverted: number;
  indexesEnsured: number;
  ttlIndexRemoved: boolean;
}

export interface Novex2MigrationReadiness {
  _id: "novex-2";
  version: 2;
  status: "PRE_MIGRATION" | "APPLYING" | "READY" | "BLOCKED";
  attemptId: string;
  sourcePlanFingerprint: string;
  readyPlanFingerprint?: string;
  blockedPlanFingerprint?: string;
  blockers?: string[];
  startedAt: Date;
  completedAt?: Date;
  blockedAt?: Date;
  updatedAt: Date;
  legacyWriterRevision?: number;
}

export type Novex2MigrationReadinessRecoveryMode =
  | "MARK_READY"
  | "ABANDON_BLOCKED";

export interface Novex2MigrationReadinessRecoveryResult {
  attemptId: string;
  status: "READY" | "BLOCKED";
  inspectedPlanFingerprint: string;
  blockers: string[];
}

const NOVEX_MIGRATION_READINESS = "stock_market_migration_readiness";

const HISTORY_PERMANENT_INDEX = {
  collection: "stock_price_history",
  name: "stock_price_history_createdAt",
} as const;

function legacyDisclosureId(eventId: string): string {
  return `stock-disclosure:legacy:${eventId}`;
}

function kstSlotKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((row) => row.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function novexSlotDate(slotKey: string): Date {
  return new Date(`${slotKey.replace(" ", "T")}:00+09:00`);
}

function legacyEventTargetSlotKey(
  event: StockScheduledEvent,
  inspectedAt: Date,
): string {
  const earliest = event.executeAt.getTime() > inspectedAt.getTime()
    ? new Date(event.executeAt.getTime() - 1)
    : inspectedAt;
  return kstSlotKey(nextNovexSlotAfter(earliest));
}

export function nextNovexSlotAfter(value: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const nextHour = [9, 13, 18, 23].find((hour) =>
    new Date(
      `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`,
    ).getTime() > value.getTime(),
  );
  if (nextHour !== undefined) {
    return new Date(
      `${date}T${String(nextHour).padStart(2, "0")}:00:00+09:00`,
    );
  }
  const nextDate = new Date(`${date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return new Date(`${nextDate.toISOString().slice(0, 10)}T09:00:00+09:00`);
}

function allNovexIndexSpecs(): Array<{
  collection: string;
  name: string;
  definition: IndexDescription;
}> {
  return [
    {
      ...HISTORY_PERMANENT_INDEX,
      definition: {
        key: { createdAt: 1 },
        name: HISTORY_PERMANENT_INDEX.name,
      },
    },
    ...Object.entries(NOVEX_INDEX_DEFINITIONS).flatMap(([collection, definitions]) =>
      definitions.map((definition) => ({
        collection,
        name: String(definition.name),
        definition,
      })),
    ),
  ];
}

interface ExistingIndexDescription {
  name?: string;
  key?: unknown;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
  expireAfterSeconds?: number;
  collation?: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

/** MongoDB compound index key 순서는 query prefix 계약의 일부이므로 보존한다. */
function normalizeIndexKey(value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()].map(([field, direction]) => [
      String(field),
      canonicalize(direction),
    ]);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).map(
      ([field, direction]) => [field, canonicalize(direction)],
    );
  }
  return canonicalize(value ?? {});
}

export function legacyPendingEventContentHash(
  event: StockScheduledEvent,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      id: event._id,
      ticker: event.ticker,
      kstDate: event.kstDate,
      executeAt: event.executeAt.toISOString(),
      changePercent: event.changePercent,
      eventText: event.eventText,
      eventTier: event.eventTier,
      createdBy: event.createdBy,
      createdAt: event.createdAt.toISOString(),
    }))
    .digest("hex");
}

function normalizeIndexSpec(
  index: ExistingIndexDescription | IndexDescription,
): NormalizedIndexSpec {
  return {
    key: normalizeIndexKey(index.key),
    unique: index.unique === true,
    sparse: index.sparse === true,
    partialFilterExpression: canonicalize(
      index.partialFilterExpression ?? null,
    ),
    expireAfterSeconds:
      typeof index.expireAfterSeconds === "number"
        ? index.expireAfterSeconds
        : null,
    collation: canonicalize(index.collation ?? null),
  };
}

function sameIndexSpec(
  left: NormalizedIndexSpec,
  right: NormalizedIndexSpec,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableMigrationPlan(plan: Novex2MigrationPlan) {
  return {
    ttlIndexPresent: plan.ttlIndexPresent,
    ttlIndexNames: [...plan.ttlIndexNames].sort(),
    ttlIndexSpecs: [...plan.ttlIndexSpecs].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    pricesWithoutReferencePrice: plan.pricesWithoutReferencePrice,
    referencePriceBackfillSpecs: [...plan.referencePriceBackfillSpecs].sort(
      (left, right) => left.ticker.localeCompare(right.ticker),
    ),
    legacyPendingEvents: plan.legacyPendingEvents,
    legacyPendingEventsAlreadyConverted:
      plan.legacyPendingEventsAlreadyConverted,
    legacyPendingEventsToConvert: plan.legacyPendingEventsToConvert,
    indexSpecs: [...plan.indexSpecs]
      .map((spec) => ({
        collection: spec.collection,
        name: spec.name,
        action: spec.action,
        expected: spec.expected,
        ...(spec.actual ? { actual: spec.actual } : {}),
      }))
      .sort((left, right) =>
        `${left.collection}:${left.name}`.localeCompare(
          `${right.collection}:${right.name}`,
        ),
      ),
    uniqueIndexChecks: [...plan.uniqueIndexChecks].sort((left, right) =>
      `${left.collection}:${left.name}`.localeCompare(
        `${right.collection}:${right.name}`,
      ),
    ),
    legacyPendingEventSpecs: [...plan.legacyPendingEventSpecs].sort(
      (left, right) => left.id.localeCompare(right.id),
    ),
    legacyPendingPriceEffectConflicts: [
      ...plan.legacyPendingPriceEffectConflicts,
    ].sort((left, right) =>
      `${left.targetSlotKey}:${left.ticker}`.localeCompare(
        `${right.targetSlotKey}:${right.ticker}`,
      ),
    ),
  };
}

export function novex2MigrationPlanFingerprint(
  plan: Novex2MigrationPlan,
): string {
  return createHash("sha256")
    .update(JSON.stringify(stableMigrationPlan(plan)))
    .digest("hex");
}

export function novex2MigrationReadinessBlockers(
  plan: Novex2MigrationPlan,
): string[] {
  return [
    plan.ttlIndexPresent ? "stock_price_history TTL index remains" : null,
    plan.pricesWithoutReferencePrice > 0
      ? `referencePrice missing=${plan.pricesWithoutReferencePrice}`
      : null,
    plan.indexesToCreate.length > 0
      ? `NOVEX indexes pending=${plan.indexesToCreate.length}`
      : null,
    plan.legacyPendingEventsToConvert > 0
      ? `legacy pending events=${plan.legacyPendingEventsToConvert}`
      : null,
    plan.legacyPendingPriceEffectConflicts.length > 0
      ? `legacy price conflicts=${plan.legacyPendingPriceEffectConflicts.length}`
      : null,
    ...plan.uniqueIndexChecks
      .filter((item) => item.duplicateGroups > 0)
      .map(
        (item) =>
          `unique duplicates ${item.collection}.${item.name}=${item.duplicateGroups}`,
      ),
  ].filter((item): item is string => item !== null);
}

export async function getNovex2MigrationReadiness(
  db: Db,
  session?: ClientSession,
): Promise<Novex2MigrationReadiness | null> {
  return db
    .collection<Novex2MigrationReadiness>(NOVEX_MIGRATION_READINESS)
    .findOne({ _id: "novex-2" }, { session });
}

export async function claimNovex2MigrationReadiness(
  db: Db,
  input: {
    sourcePlanFingerprint: string;
    attemptId?: string;
    now?: Date;
  },
): Promise<{ attemptId: string; startedAt: Date }> {
  const attemptId = input.attemptId ?? randomUUID();
  const startedAt = input.now ?? new Date();
  try {
    const result = await db.collection<Novex2MigrationReadiness>(
      NOVEX_MIGRATION_READINESS,
    ).updateOne(
      // NOVEX-2는 one-shot이다. 문서가 없으면 upsert하고, crash recovery로
      // legacy writer fence인 PRE_MIGRATION 또는 명시적으로 BLOCKED 처리된
      // attempt만 새 승인으로 재개할 수 있다.
      // READY/APPLYING은 _id duplicate-key로 fail closed 한다.
      { _id: "novex-2", status: { $in: ["PRE_MIGRATION", "BLOCKED"] } },
      {
        $set: {
          version: 2,
          status: "APPLYING",
          attemptId,
          sourcePlanFingerprint: input.sourcePlanFingerprint,
          startedAt,
          updatedAt: startedAt,
        },
        $unset: {
          readyPlanFingerprint: "",
          blockedPlanFingerprint: "",
          blockers: "",
          completedAt: "",
          blockedAt: "",
        },
      },
      { upsert: true },
    );
    if (result.matchedCount + result.upsertedCount !== 1) {
      throw new Error("NOVEX_MIGRATION_READINESS_CLAIM_FAILED");
    }
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const current = await getNovex2MigrationReadiness(db);
      if (current?.status === "APPLYING") {
        throw new Error("NOVEX_MIGRATION_ALREADY_APPLYING");
      }
      if (current?.status === "READY") {
        throw new Error("NOVEX_MIGRATION_ALREADY_READY");
      }
      throw new Error(
        `NOVEX_MIGRATION_READINESS_CLAIM_BLOCKED:${current?.status ?? "UNKNOWN"}`,
      );
    }
    throw error;
  }
  return { attemptId, startedAt };
}

/**
 * 비원자적 DDL/data migration 도중 프로세스가 종료되어 APPLYING marker가
 * 남았을 때만 사용하는 명시적 복구 경로다. 호출 시점의 물리 상태를 다시
 * inspect하고 승인된 fingerprint와 일치해야 하며, exact attemptId CAS 없이는
 * marker를 변경하지 않는다.
 */
export async function recoverNovex2MigrationReadiness(
  db: Db,
  input: {
    mode: Novex2MigrationReadinessRecoveryMode;
    expectedAttemptId: string;
    expectedPlanFingerprint: string;
    now?: Date;
  },
): Promise<Novex2MigrationReadinessRecoveryResult> {
  if (!input.expectedAttemptId.trim()) {
    throw new Error("NOVEX_MIGRATION_RECOVERY_ATTEMPT_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.expectedPlanFingerprint)) {
    throw new Error("NOVEX_MIGRATION_RECOVERY_PLAN_FINGERPRINT_INVALID");
  }

  // 반드시 함수 안에서 fresh physical inspect를 수행한다. 호출자가 넘긴 plan
  // 객체나 과거 dry-run 결과를 신뢰하지 않는다.
  const inspectedPlan = await inspectNovex2Migration(db);
  const inspectedPlanFingerprint =
    novex2MigrationPlanFingerprint(inspectedPlan);
  if (inspectedPlanFingerprint !== input.expectedPlanFingerprint) {
    throw new Error(
      `NOVEX_MIGRATION_RECOVERY_PLAN_CHANGED:${input.expectedPlanFingerprint}:${inspectedPlanFingerprint}`,
    );
  }

  const readiness = await getNovex2MigrationReadiness(db);
  if (readiness?.status !== "APPLYING") {
    throw new Error("NOVEX_MIGRATION_RECOVERY_NOT_APPLYING");
  }
  if (readiness.attemptId !== input.expectedAttemptId) {
    throw new Error("NOVEX_MIGRATION_RECOVERY_ATTEMPT_CHANGED");
  }

  const blockers = novex2MigrationReadinessBlockers(inspectedPlan);
  if (input.mode === "MARK_READY" && blockers.length > 0) {
    throw new Error(
      `NOVEX_MIGRATION_RECOVERY_STILL_BLOCKED:${blockers.join(",")}`,
    );
  }
  if (input.mode === "ABANDON_BLOCKED" && blockers.length === 0) {
    throw new Error("NOVEX_MIGRATION_RECOVERY_READY_CANNOT_BE_ABANDONED");
  }

  const recoveredAt = input.now ?? new Date();
  const marker = db.collection<Novex2MigrationReadiness>(
    NOVEX_MIGRATION_READINESS,
  );
  const exactOwner = {
    _id: "novex-2" as const,
    version: 2 as const,
    status: "APPLYING" as const,
    attemptId: input.expectedAttemptId,
    sourcePlanFingerprint: readiness.sourcePlanFingerprint,
    updatedAt: readiness.updatedAt,
  };
  const result = input.mode === "MARK_READY"
    ? await marker.updateOne(
      exactOwner,
      {
        $set: {
          status: "READY",
          readyPlanFingerprint: inspectedPlanFingerprint,
          completedAt: recoveredAt,
          updatedAt: recoveredAt,
        },
        $unset: {
          blockedPlanFingerprint: "",
          blockers: "",
          blockedAt: "",
        },
      },
    )
    : await marker.updateOne(
      exactOwner,
      {
        $set: {
          status: "BLOCKED",
          blockedPlanFingerprint: inspectedPlanFingerprint,
          blockers,
          blockedAt: recoveredAt,
          updatedAt: recoveredAt,
        },
        $unset: {
          readyPlanFingerprint: "",
          completedAt: "",
        },
      },
    );
  if (result.matchedCount !== 1) {
    throw new Error("NOVEX_MIGRATION_RECOVERY_OWNERSHIP_LOST");
  }

  return {
    attemptId: input.expectedAttemptId,
    status: input.mode === "MARK_READY" ? "READY" : "BLOCKED",
    inspectedPlanFingerprint,
    blockers,
  };
}

async function countUniqueIndexDuplicateGroups(
  db: Db,
  collection: string,
  definition: IndexDescription,
): Promise<number> {
  const key = definition.key;
  if (!key || typeof key !== "object" || Array.isArray(key)) return 0;
  const fields = Object.keys(key);
  if (fields.length === 0) return 0;
  const match: Record<string, unknown> = {
    ...((definition.partialFilterExpression ?? {}) as Record<string, unknown>),
  };
  if (definition.sparse) {
    for (const field of fields) match[field] = { $exists: true };
  }
  const duplicate = await db.collection(collection).aggregate<{ count: number }>([
    ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
    {
      $group: {
        _id: Object.fromEntries(
          fields.map((field, index) => [`key${index}`, `$${field}`]),
        ),
        documents: { $sum: 1 },
      },
    },
    { $match: { documents: { $gt: 1 } } },
    { $count: "count" },
  ]).next();
  return duplicate?.count ?? 0;
}

async function existingIndexes(
  db: Db,
  collection: string,
): Promise<ExistingIndexDescription[]> {
  try {
    return await db.collection(collection).indexes();
  } catch (error) {
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  }
}

async function assertPlannedIndexStillMatches(
  db: Db,
  collection: string,
  name: string,
  expected: NormalizedIndexSpec,
): Promise<void> {
  const current = (await existingIndexes(db, collection)).find(
    (index) => index.name === name,
  );
  if (!current || !sameIndexSpec(normalizeIndexSpec(current), expected)) {
    throw new Error(
      `NOVEX_MIGRATION_INDEX_CHANGED:${collection}.${name}`,
    );
  }
}

/** read-only preflight. 라이브 DB에 대한 호출은 별도 운영 승인 뒤에만 수행한다. */
export async function inspectNovex2Migration(
  db: Db,
  inspectedAt = new Date(),
): Promise<Novex2MigrationPlan> {
  const historyIndexes = await existingIndexes(db, "stock_price_history");
  const ttlIndexSpecs = historyIndexes
    .filter((index) => typeof index.expireAfterSeconds === "number")
    .filter((index): index is ExistingIndexDescription & { name: string } =>
      Boolean(index.name),
    )
    .map((index) => ({ name: index.name, actual: normalizeIndexSpec(index) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const ttlIndexNames = ttlIndexSpecs.map((index) => index.name);
  const specs = allNovexIndexSpecs();
  const existingByCollection = new Map<string, ExistingIndexDescription[]>();
  for (const collection of new Set(specs.map((spec) => spec.collection))) {
    existingByCollection.set(collection, await existingIndexes(db, collection));
  }
  const indexSpecs = specs.flatMap((spec): Novex2IndexPlanSpec[] => {
    const actualIndex = existingByCollection
      .get(spec.collection)
      ?.find((index) => index.name === spec.name);
    const expected = normalizeIndexSpec(spec.definition);
    if (!actualIndex) {
      return [{
        collection: spec.collection,
        name: spec.name,
        action: "CREATE",
        expected,
      }];
    }
    const actual = normalizeIndexSpec(actualIndex);
    return sameIndexSpec(expected, actual)
      ? []
      : [{
          collection: spec.collection,
          name: spec.name,
          action: "RECREATE",
          expected,
          actual,
        }];
  });
  const uniqueIndexChecks = await Promise.all(
    specs
      .filter((spec) => spec.definition.unique === true)
      .map(async (spec): Promise<Novex2UniqueIndexCheck> => ({
        collection: spec.collection,
        name: spec.name,
        duplicateGroups: await countUniqueIndexDuplicateGroups(
          db,
          spec.collection,
          spec.definition,
        ),
      })),
  );
  const legacy = db.collection<StockScheduledEvent & { migratedDisclosureId?: string }>("stock_scheduled_events");
  const referencePriceBackfillSpecs = await db
    .collection<{ ticker: string; price: number }>("stock_prices")
    .find(
      { referencePrice: { $exists: false } },
      { projection: { _id: 0, ticker: 1, price: 1 } },
    )
    .sort({ ticker: 1 })
    .toArray();
  const legacyPendingRows = await legacy.find({ status: "PENDING" }).toArray();
  const legacyPendingEvents = legacyPendingRows.length;
  const legacyPendingEventsAlreadyConverted = legacyPendingRows.filter(
    (event) => typeof event.migratedDisclosureId === "string",
  ).length;
  const legacyPendingEventSpecs = legacyPendingRows
    .filter((event) => typeof event.migratedDisclosureId !== "string")
    .map((event) => ({
      id: event._id,
      contentHash: legacyPendingEventContentHash(event),
      ticker: event.ticker,
      targetSlotKey: legacyEventTargetSlotKey(event, inspectedAt),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const scheduledPriceDisclosures = legacyPendingEventSpecs.length > 0
    ? await db.collection<StockDisclosure>("stock_disclosures").find({
      status: "SCHEDULED",
      kind: "PRICE",
      slotKey: { $in: [...new Set(legacyPendingEventSpecs.map((row) => row.targetSlotKey))] },
    }).toArray()
    : [];
  const legacyPendingPriceEffectConflicts =
    findNovex2LegacyPriceEffectConflicts(
      legacyPendingEventSpecs,
      scheduledPriceDisclosures,
    );
  return {
    ttlIndexPresent: ttlIndexNames.length > 0,
    ttlIndexNames,
    ttlIndexSpecs,
    pricesWithoutReferencePrice: referencePriceBackfillSpecs.length,
    referencePriceBackfillSpecs,
    indexesToCreate: indexSpecs.map((spec) => spec.name),
    indexSpecs,
    uniqueIndexChecks,
    legacyPendingEventSpecs,
    legacyPendingPriceEffectConflicts,
    legacyPendingEvents,
    legacyPendingEventsAlreadyConverted,
    legacyPendingEventsToConvert: legacyPendingEventSpecs.length,
  };
}

/**
 * legacy PENDING 이벤트 하나의 marker와 변환 공시를 같은 transaction으로 묶는다.
 * legacy tick도 같은 이벤트 문서를 먼저 갱신하므로 어느 쪽이 먼저 commit해도
 * APPLIED 이벤트와 SCHEDULED 공시가 동시에 남지 않는다.
 */
export async function migrateLegacyPendingStockDisclosures(
  db: Db,
  targets: readonly Novex2LegacyPendingEventSpec[],
  migratedAt = new Date(),
  options: { now?: () => Date } = {},
): Promise<number> {
  const legacy = db.collection<StockScheduledEvent & {
    migratedDisclosureId?: string;
    migratedAt?: Date;
  }>("stock_scheduled_events");
  if (targets.length === 0) return 0;
  const duplicateTargets = new Map<string, string[]>();
  for (const target of targets) {
    const key = `${target.targetSlotKey}\u0000${target.ticker}`;
    const ids = duplicateTargets.get(key) ?? [];
    ids.push(target.id);
    duplicateTargets.set(key, ids);
  }
  const duplicate = [...duplicateTargets.entries()].find(([, ids]) => ids.length > 1);
  if (duplicate) {
    throw new Error(`NOVEX_MIGRATION_LEGACY_PRICE_EFFECT_CONFLICT:${duplicate[0]}:${duplicate[1].join(",")}`);
  }
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const pending = await legacy.find({
    _id: { $in: [...targetById.keys()] },
    status: "PENDING",
    migratedDisclosureId: { $exists: false },
  }).toArray();
  const session = db.client.startSession();
  let converted = 0;
  try {
    for (const pendingEvent of pending) {
      let convertedEvent = false;
      await session.withTransaction(async () => {
        convertedEvent = false;
        const disclosureId = legacyDisclosureId(pendingEvent._id);
        const target = targetById.get(pendingEvent._id);
        if (!target) return;
        await db.collection<{ _id: string; revision: number }>(
          "stock_disclosure_effect_fences",
        ).updateOne(
          { _id: target.targetSlotKey },
          { $inc: { revision: 1 } },
          { upsert: true, session },
        );
        const publishAt = novexSlotDate(target.targetSlotKey);
        // Slot fence 대기나 transaction 재시도 중 cutoff를 넘을 수 있으므로,
        // 함수 진입 시각이 아니라 fence를 획득한 현재 attempt의 시각을 검사한다.
        const cutoffCheckedAt = options.now?.() ?? new Date();
        if (publishAt.getTime() <= cutoffCheckedAt.getTime()) {
          throw new Error(
            `NOVEX_MIGRATION_LEGACY_SLOT_CUTOFF_PASSED:${target.targetSlotKey}`,
          );
        }
        const marketState = await db.collection<{
          _id: string;
          lastCompletedSlotKey?: string;
        }>("stock_market_state").findOne(
          { _id: "novex" },
          { session },
        );
        if (
          marketState?.lastCompletedSlotKey &&
          marketState.lastCompletedSlotKey >= target.targetSlotKey
        ) {
          throw new Error(
            `NOVEX_MIGRATION_LEGACY_SLOT_CUTOFF_PASSED:${target.targetSlotKey}`,
          );
        }
        const disclosures = db.collection<StockDisclosure>("stock_disclosures");
        const conflictingDisclosure = await disclosures.findOne({
          _id: { $ne: disclosureId },
          status: "SCHEDULED",
          kind: "PRICE",
          slotKey: target.targetSlotKey,
          effects: {
            $elemMatch: {
              scope: "TICKER",
              ticker: target.ticker,
            },
          },
        }, { session });
        if (conflictingDisclosure) {
          throw new Error(
            `NOVEX_MIGRATION_LEGACY_PRICE_EFFECT_CONFLICT:${target.targetSlotKey}:${target.ticker}:${conflictingDisclosure._id}`,
          );
        }
        const event = await legacy.findOneAndUpdate(
          {
            _id: pendingEvent._id,
            status: "PENDING",
            migratedDisclosureId: { $exists: false },
          },
          {
            $set: {
              migratedDisclosureId: disclosureId,
              migratedAt,
              updatedAt: migratedAt,
            },
          },
          { returnDocument: "after", session },
        );
        if (!event) return;
        if (
          !target ||
          legacyPendingEventContentHash(event) !== target.contentHash ||
          event.ticker !== target.ticker
        ) {
          throw new Error(`NOVEX_MIGRATION_LEGACY_EVENT_CHANGED:${event._id}`);
        }

        await disclosures.updateOne(
          { _id: disclosureId },
          {
            $setOnInsert: {
              _id: disclosureId,
              title: `${event.ticker} 예약 공시`,
              body: event.eventText,
              kind: "PRICE",
              status: "SCHEDULED",
              source: "GM",
              effects: [{
                scope: "TICKER",
                ticker: event.ticker,
                changePercent: event.changePercent,
                structural: false,
              }],
              publishAt,
              slotKey: target.targetSlotKey,
              shock: event.eventTier === "shock",
              createdById: event.createdBy.id,
              createdAt: event.createdAt,
              updatedAt: migratedAt,
              templateId: "legacy-stock-scheduled-event",
            },
          },
          { upsert: true, session },
        );
        const linked = await disclosures.findOne(
          { _id: disclosureId },
          { session },
        );
        const effect = linked?.effects[0];
        if (
          !linked ||
          linked.status !== "SCHEDULED" ||
          linked.source !== "GM" ||
          linked.templateId !== "legacy-stock-scheduled-event" ||
          linked.body !== event.eventText ||
          linked.slotKey !== target.targetSlotKey ||
          linked.publishAt?.getTime() !== publishAt.getTime() ||
          linked.effects.length !== 1 ||
          effect?.scope !== "TICKER" ||
          effect.ticker !== event.ticker ||
          effect.changePercent !== event.changePercent ||
          effect.structural !== false
        ) {
          throw new Error(
            `NOVEX_MIGRATION_DISCLOSURE_COLLISION:${disclosureId}`,
          );
        }
        convertedEvent = true;
      });
      if (convertedEvent) converted += 1;
    }
  } finally {
    await session.endSession();
  }
  return converted;
}

/**
 * TTL 제거·적정가 backfill·신규 index·legacy PENDING 공시 변환.
 * 자동 실행 진입점이 없고 운영 승인 뒤 명시적인 --apply 경로에서만 호출한다.
 */
export async function applyNovex2Migration(
  db: Db,
  options: { expectedPlanFingerprint: string },
): Promise<Novex2MigrationResult> {
  const inspectedAt = new Date();
  const plan = await inspectNovex2Migration(db, inspectedAt);
  const actualPlanFingerprint = novex2MigrationPlanFingerprint(plan);
  if (actualPlanFingerprint !== options.expectedPlanFingerprint) {
    throw new Error(
      `NOVEX_MIGRATION_PLAN_CHANGED:${options.expectedPlanFingerprint}:${actualPlanFingerprint}`,
    );
  }
  const duplicateBlockers = plan.uniqueIndexChecks.filter(
    (check) => check.duplicateGroups > 0,
  );
  if (duplicateBlockers.length > 0) {
    throw new Error(
      `NOVEX_MIGRATION_UNIQUE_DUPLICATES:${duplicateBlockers
        .map((check) => `${check.collection}.${check.name}=${check.duplicateGroups}`)
        .join(",")}`,
    );
  }
  if (plan.legacyPendingPriceEffectConflicts.length > 0) {
    throw new Error(
      `NOVEX_MIGRATION_LEGACY_PRICE_EFFECT_CONFLICT:${plan.legacyPendingPriceEffectConflicts
        .map((conflict) =>
          `${conflict.targetSlotKey}:${conflict.ticker}:legacy=${conflict.legacyEventIds.join("+")}:existing=${conflict.existingDisclosureIds.join("+")}`,
        )
      .join(",")}`,
    );
  }
  const { attemptId } = await claimNovex2MigrationReadiness(db, {
    sourcePlanFingerprint: actualPlanFingerprint,
  });
  // 최초 inspect와 claim 사이에 commit된 legacy writer를 놓치지 않는다.
  // claim 이후에는 readiness 문서 fence가 새 CREATE를 차단하므로 이 fresh
  // physical plan은 migration mutation을 시작하기 전의 안정된 입력이다.
  const fencedPlan = await inspectNovex2Migration(db, inspectedAt);
  const fencedPlanFingerprint = novex2MigrationPlanFingerprint(fencedPlan);
  if (fencedPlanFingerprint !== actualPlanFingerprint) {
    const blockedAt = new Date();
    const blocked = await db.collection<Novex2MigrationReadiness>(
      NOVEX_MIGRATION_READINESS,
    ).updateOne(
      {
        _id: "novex-2",
        status: "APPLYING",
        attemptId,
        sourcePlanFingerprint: actualPlanFingerprint,
      },
      {
        $set: {
          status: "BLOCKED",
          blockedPlanFingerprint: fencedPlanFingerprint,
          blockers: ["approved migration plan changed while acquiring cutover fence"],
          blockedAt,
          updatedAt: blockedAt,
        },
        $unset: {
          readyPlanFingerprint: "",
          completedAt: "",
        },
      },
    );
    if (blocked.matchedCount !== 1) {
      throw new Error("NOVEX_MIGRATION_READINESS_OWNERSHIP_LOST");
    }
    throw new Error(
      `NOVEX_MIGRATION_PLAN_CHANGED_AFTER_CLAIM:${actualPlanFingerprint}:${fencedPlanFingerprint}`,
    );
  }
  let referencePricesBackfilled = 0;
  if (plan.referencePriceBackfillSpecs.length > 0) {
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        let transactionBackfilled = 0;
        const prices = db.collection("stock_prices");
        for (const target of plan.referencePriceBackfillSpecs) {
          const result = await prices.updateOne(
            {
              ticker: target.ticker,
              price: target.price,
              referencePrice: { $exists: false },
            },
            { $set: { referencePrice: target.price } },
            { session },
          );
          if (result.matchedCount !== 1) {
            throw new Error(
              `NOVEX_MIGRATION_REFERENCE_PRICE_CHANGED:${target.ticker}`,
            );
          }
          transactionBackfilled += result.modifiedCount;
        }
        referencePricesBackfilled = transactionBackfilled;
      });
    } finally {
      await session.endSession();
    }
  }

  const history = db.collection("stock_price_history");
  const ttlIndexRemoved = plan.ttlIndexNames.length > 0;
  for (const spec of plan.ttlIndexSpecs) {
    await assertPlannedIndexStillMatches(
      db,
      "stock_price_history",
      spec.name,
      spec.actual,
    );
    await history.dropIndex(spec.name);
  }
  for (const spec of plan.indexSpecs.filter((item) => item.action === "RECREATE")) {
    // history TTL index는 위에서 이미 제거했을 수 있다.
    if (
      spec.actual &&
      !(
        spec.collection === "stock_price_history" &&
        plan.ttlIndexNames.includes(spec.name)
      )
    ) {
      await assertPlannedIndexStillMatches(
        db,
        spec.collection,
        spec.name,
        spec.actual,
      );
    }
    try {
      await db.collection(spec.collection).dropIndex(spec.name);
    } catch (error) {
      if ((error as { code?: number }).code !== 27) throw error;
    }
  }
  await history.createIndex({ createdAt: 1 }, { name: HISTORY_PERMANENT_INDEX.name });
  let indexesEnsured = 1;
  for (const [collection, definitions] of Object.entries(NOVEX_INDEX_DEFINITIONS)) {
    await db.collection(collection).createIndexes(definitions);
    indexesEnsured += definitions.length;
  }

  const converted = await migrateLegacyPendingStockDisclosures(
    db,
    plan.legacyPendingEventSpecs,
  );
  const readyPlan = await inspectNovex2Migration(db);
  const readinessBlockers = novex2MigrationReadinessBlockers(readyPlan);
  if (readinessBlockers.length > 0) {
    throw new Error(
      `NOVEX_MIGRATION_NOT_READY:${readinessBlockers.join(",")}`,
    );
  }
  const readyPlanFingerprint = novex2MigrationPlanFingerprint(readyPlan);
  const completedAt = new Date();
  const readinessResult = await db.collection<Novex2MigrationReadiness>(
    NOVEX_MIGRATION_READINESS,
  ).updateOne(
    { _id: "novex-2", status: "APPLYING", attemptId },
    {
      $set: {
        status: "READY",
        readyPlanFingerprint,
        completedAt,
        updatedAt: completedAt,
      },
    },
  );
  if (readinessResult.matchedCount !== 1) {
    throw new Error("NOVEX_MIGRATION_READINESS_OWNERSHIP_LOST");
  }
  return {
    referencePricesBackfilled,
    legacyPendingEventsConverted: converted,
    indexesEnsured,
    ttlIndexRemoved,
  };
}
