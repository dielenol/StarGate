import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  MongoServerError,
  ObjectId,
  type ClientSession,
} from "mongodb";

import type {
  IntegrationOutboxEvent,
  IntegrationOutboxKind,
  ScheduledJobRun,
  WorkerCheckpoint,
} from "../types/worker.js";

import {
  integrationOutboxCol,
  scheduledJobRunsCol,
  workerCheckpointsCol,
} from "../collections.js";

const DEFAULT_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BACKOFF_MS = 30_000;
const MAX_ERROR_LENGTH = 2_000;

export class IntegrationOutboxConflictError extends Error {
  constructor(readonly dedupeKey: string) {
    super(
      `integration_outbox dedupeKey가 서로 다른 이벤트에 재사용되었습니다: ${dedupeKey}`,
    );
    this.name = "IntegrationOutboxConflictError";
  }
}

function assertMatchingIntegrationOutbox(
  existing: IntegrationOutboxEvent,
  input: EnqueueIntegrationOutboxInput,
): IntegrationOutboxEvent {
  if (
    existing.kind !== input.kind ||
    existing.version !== (input.version ?? 1) ||
    existing.partitionKey !== input.partitionKey ||
    existing.partitionOrderAt?.getTime() !== input.partitionOrderAt?.getTime() ||
    !isDeepStrictEqual(existing.payload, input.payload)
  ) {
    throw new IntegrationOutboxConflictError(input.dedupeKey);
  }
  return existing;
}

export interface ClaimScheduledJobRunInput {
  jobName: string;
  slotKey: string;
  now?: Date;
  requestedAt?: Date;
  leaseMs?: number;
  maxAttempts?: number;
}

export interface FindDueScheduledJobRunsInput {
  now?: Date;
  maxAttempts?: number;
  limit?: number;
  jobNames?: string[];
  slotKey?: string;
}

export interface ExpireStaleScheduledJobRunsInput {
  currentSlotKey: string;
  now?: Date;
  jobNames?: string[];
}

export interface EnqueueIntegrationOutboxInput {
  kind: IntegrationOutboxKind;
  dedupeKey: string;
  partitionKey?: string;
  partitionOrderAt?: Date;
  payload: Record<string, unknown>;
  version?: number;
  availableAt?: Date;
}

export interface ClaimIntegrationOutboxInput {
  now?: Date;
  leaseMs?: number;
  maxAttempts?: number;
  kinds?: IntegrationOutboxKind[];
}

export interface ReapExpiredScheduledJobRunsInput {
  now?: Date;
  maxAttempts?: number;
  jobName?: string;
  slotKey?: string;
}

export interface ReapExpiredIntegrationOutboxInput {
  now?: Date;
  maxAttempts?: number;
  kinds?: IntegrationOutboxKind[];
}

export interface SweepExpiredWorkerLeasesInput {
  now?: Date;
  scheduledMaxAttempts?: number;
  outboxMaxAttempts?: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return fallback;
  return value as number;
}

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function nextBackoffMs(attempts: number, baseMs = DEFAULT_BACKOFF_MS): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 10));
  return baseMs * 2 ** exponent;
}

export async function claimScheduledJobRun(
  input: ClaimScheduledJobRunInput,
): Promise<ScheduledJobRun | null> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const leaseMs = normalizePositiveInteger(input.leaseMs, DEFAULT_LEASE_MS);
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const initial: ScheduledJobRun = {
    jobName: input.jobName,
    slotKey: input.slotKey,
    status: "RUNNING",
    attempts: 1,
    availableAt: now,
    leaseToken,
    leaseUntil,
    startedAt: input.requestedAt ?? now,
    updatedAt: now,
  };

  try {
    const result = await col.insertOne(initial);
    return { ...initial, _id: result.insertedId };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  await reapExpiredScheduledJobRuns({
    jobName: input.jobName,
    slotKey: input.slotKey,
    now,
    maxAttempts,
  });

  return col.findOneAndUpdate(
    {
      jobName: input.jobName,
      slotKey: input.slotKey,
      attempts: { $lt: maxAttempts },
      $or: [
        { status: "FAILED", availableAt: { $lte: now } },
        { status: "RUNNING", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "RUNNING",
        leaseToken,
        leaseUntil,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
      $unset: { lastError: "" },
    },
    { returnDocument: "after" },
  );
}

export async function findDueScheduledJobRuns(
  input: FindDueScheduledJobRunsInput = {},
): Promise<ScheduledJobRun[]> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const limit = normalizePositiveInteger(input.limit, 50);

  return col
    .find({
      ...(input.jobNames && input.jobNames.length > 0
        ? { jobName: { $in: input.jobNames } }
        : {}),
      ...(input.slotKey ? { slotKey: input.slotKey } : {}),
      attempts: { $lt: maxAttempts },
      $or: [
        { status: "FAILED", availableAt: { $lte: now } },
        { status: "RUNNING", leaseUntil: { $lte: now } },
      ],
    })
    .sort({ availableAt: 1, startedAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
}

export async function expireStaleScheduledJobRuns(
  input: ExpireStaleScheduledJobRunsInput,
): Promise<number> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const result = await col.updateMany(
    {
      ...(input.jobNames && input.jobNames.length > 0
        ? { jobName: { $in: input.jobNames } }
        : {}),
      slotKey: { $lt: input.currentSlotKey },
      $or: [
        { status: "FAILED" },
        { status: "RUNNING", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "DEAD",
        lastError: `현재 ${input.currentSlotKey}보다 오래된 예약 작업 슬롯이라 재실행하지 않았습니다.`,
        completedAt: now,
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount;
}

export async function renewScheduledJobRunLease(input: {
  id: ObjectId | string;
  leaseToken: string;
  now?: Date;
  leaseMs?: number;
}): Promise<Date | null> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const leaseMs = normalizePositiveInteger(input.leaseMs, DEFAULT_LEASE_MS);
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const id =
    typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await col.findOneAndUpdate(
    {
      _id: id,
      status: "RUNNING",
      leaseToken: input.leaseToken,
      leaseUntil: { $gt: now },
    },
    {
      $set: {
        leaseUntil,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  return result?.leaseUntil ?? null;
}

export async function completeScheduledJobRun(input: {
  id: ObjectId | string;
  leaseToken: string;
  summary?: Record<string, unknown>;
  now?: Date;
}): Promise<boolean> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const id =
    typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await col.updateOne(
    {
      _id: id,
      status: "RUNNING",
      leaseToken: input.leaseToken,
      leaseUntil: { $gt: now },
    },
    {
      $set: {
        status: "SUCCEEDED",
        ...(input.summary ? { summary: input.summary } : {}),
        completedAt: now,
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "", lastError: "" },
    },
  );
  return result.modifiedCount === 1;
}

export async function failScheduledJobRun(input: {
  id: ObjectId | string;
  leaseToken: string;
  error: unknown;
  attempts: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  now?: Date;
}): Promise<"FAILED" | "DEAD" | null> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const status = input.attempts >= maxAttempts ? "DEAD" : "FAILED";
  const id =
    typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await col.updateOne(
    {
      _id: id,
      status: "RUNNING",
      leaseToken: input.leaseToken,
      leaseUntil: { $gt: now },
    },
    {
      $set: {
        status,
        lastError: truncateError(input.error),
        ...(status === "FAILED"
          ? {
              availableAt: new Date(
                now.getTime() +
                  nextBackoffMs(
                    input.attempts,
                    input.backoffBaseMs,
                  ),
              ),
            }
          : {}),
        updatedAt: now,
        ...(status === "DEAD" ? { completedAt: now } : {}),
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount === 1 ? status : null;
}

export async function reapExpiredScheduledJobRuns(
  input: ReapExpiredScheduledJobRunsInput = {},
): Promise<number> {
  const col = await scheduledJobRunsCol();
  const now = input.now ?? new Date();
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const result = await col.updateMany(
    {
      ...(input.jobName ? { jobName: input.jobName } : {}),
      ...(input.slotKey ? { slotKey: input.slotKey } : {}),
      attempts: { $gte: maxAttempts },
      $or: [
        { status: "RUNNING", leaseUntil: { $lte: now } },
        { status: "FAILED", availableAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "DEAD",
        lastError: "최대 시도 횟수에서 lease 또는 재시도 기한이 만료되었습니다.",
        completedAt: now,
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount;
}

export async function enqueueIntegrationOutbox(
  input: EnqueueIntegrationOutboxInput,
  options: { session?: ClientSession } = {},
): Promise<IntegrationOutboxEvent> {
  const col = await integrationOutboxCol();
  const now = new Date();
  const doc: IntegrationOutboxEvent = {
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    ...(input.partitionKey ? { partitionKey: input.partitionKey } : {}),
    ...(input.partitionOrderAt
      ? { partitionOrderAt: input.partitionOrderAt }
      : {}),
    version: input.version ?? 1,
    payload: input.payload,
    status: "PENDING",
    attempts: 0,
    availableAt: input.availableAt ?? now,
    createdAt: now,
    updatedAt: now,
  };

  // Mongo transaction 안에서 E11000을 잡은 뒤 같은 session으로 조회하면 이미
  // transaction이 abort된 상태다. 일반 재실행과 같은 transaction 내 중복은
  // insert 전에 확인해 payload 계약을 검증한다.
  const existingBeforeInsert = await col.findOne(
    { dedupeKey: input.dedupeKey },
    { session: options.session },
  );
  if (existingBeforeInsert) {
    return assertMatchingIntegrationOutbox(existingBeforeInsert, input);
  }

  try {
    const result = await col.insertOne(doc, {
      session: options.session,
    });
    return { ...doc, _id: result.insertedId };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    if (options.session && error instanceof MongoServerError) {
      // 선조회 이후의 동시 insert 경합은 callback 전체를 새 snapshot에서
      // 재시도해야 기존 문서를 안전하게 비교할 수 있다.
      error.addErrorLabel("TransientTransactionError");
      throw error;
    }
    const existing = await col.findOne(
      { dedupeKey: input.dedupeKey },
      { session: options.session },
    );
    if (existing) {
      return assertMatchingIntegrationOutbox(existing, input);
    }
    throw error;
  }
}

export async function claimIntegrationOutbox(
  input: ClaimIntegrationOutboxInput = {},
): Promise<IntegrationOutboxEvent | null> {
  const col = await integrationOutboxCol();
  const now = input.now ?? new Date();
  const leaseMs = normalizePositiveInteger(input.leaseMs, DEFAULT_LEASE_MS);
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const kindFilter =
    input.kinds && input.kinds.length > 0
      ? { kind: { $in: input.kinds } }
      : {};

  await reapExpiredIntegrationOutbox({
    now,
    maxAttempts,
    kinds: input.kinds,
  });

  const dueFilter = {
    ...kindFilter,
    attempts: { $lt: maxAttempts },
    $or: [
      { status: "PENDING" as const, availableAt: { $lte: now } },
      { status: "PROCESSING" as const, leaseUntil: { $lte: now } },
    ],
  };
  // 파티션의 앞 이벤트가 backoff 중이어도 다른 파티션까지 굶지 않도록
  // 메모리에 전부 적재하지 않는 정렬 cursor로 claim 가능한 항목을 찾는다.
  const candidates = col.find(dueFilter).sort({ createdAt: 1, _id: 1 });
  try {
    for await (const candidate of candidates) {
      if (
        candidate.partitionKey &&
        candidate.partitionOrderAt &&
        candidate._id
      ) {
        const earlierIncomplete = await col.findOne(
          {
            partitionKey: candidate.partitionKey,
            status: { $in: ["PENDING", "PROCESSING", "DEAD"] },
            $or: [
              { partitionOrderAt: { $lt: candidate.partitionOrderAt } },
              {
                partitionOrderAt: candidate.partitionOrderAt,
                createdAt: { $lt: candidate.createdAt },
              },
              {
                partitionOrderAt: candidate.partitionOrderAt,
                createdAt: candidate.createdAt,
                _id: { $lt: candidate._id },
              },
            ],
          },
          { projection: { _id: 1 } },
        );
        if (earlierIncomplete) continue;
      }

      const claimed = await col.findOneAndUpdate(
        {
          _id: candidate._id,
          attempts: { $lt: maxAttempts },
          $or: [
            { status: "PENDING", availableAt: { $lte: now } },
            { status: "PROCESSING", leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            status: "PROCESSING",
            leaseToken,
            leaseUntil,
            updatedAt: now,
          },
          $inc: { attempts: 1 },
          $unset: { lastError: "" },
        },
        { returnDocument: "after" },
      );
      if (claimed) return claimed;
    }
  } finally {
    await candidates.close();
  }

  return null;
}

export async function completeIntegrationOutbox(input: {
  id: ObjectId | string;
  leaseToken: string;
  now?: Date;
}): Promise<boolean> {
  const col = await integrationOutboxCol();
  const now = input.now ?? new Date();
  const id =
    typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await col.updateOne(
    {
      _id: id,
      status: "PROCESSING",
      leaseToken: input.leaseToken,
      leaseUntil: { $gt: now },
    },
    {
      $set: {
        status: "DELIVERED",
        deliveredAt: now,
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "", lastError: "" },
    },
  );
  return result.modifiedCount === 1;
}

export async function failIntegrationOutbox(input: {
  id: ObjectId | string;
  leaseToken: string;
  attempts: number;
  error: unknown;
  maxAttempts?: number;
  backoffBaseMs?: number;
  now?: Date;
}): Promise<"PENDING" | "DEAD" | null> {
  const col = await integrationOutboxCol();
  const now = input.now ?? new Date();
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const status = input.attempts >= maxAttempts ? "DEAD" : "PENDING";
  const id =
    typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await col.updateOne(
    {
      _id: id,
      status: "PROCESSING",
      leaseToken: input.leaseToken,
      leaseUntil: { $gt: now },
    },
    {
      $set: {
        status,
        lastError: truncateError(input.error),
        ...(status === "PENDING"
          ? {
              availableAt: new Date(
                now.getTime() +
                  nextBackoffMs(
                    input.attempts,
                    input.backoffBaseMs,
                  ),
              ),
            }
          : { deadAt: now }),
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount === 1 ? status : null;
}

export async function reapExpiredIntegrationOutbox(
  input: ReapExpiredIntegrationOutboxInput = {},
): Promise<number> {
  const col = await integrationOutboxCol();
  const now = input.now ?? new Date();
  const maxAttempts = normalizePositiveInteger(
    input.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const result = await col.updateMany(
    {
      ...(input.kinds && input.kinds.length > 0
        ? { kind: { $in: input.kinds } }
        : {}),
      attempts: { $gte: maxAttempts },
      $or: [
        { status: "PROCESSING", leaseUntil: { $lte: now } },
        { status: "PENDING", availableAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "DEAD",
        lastError: "최대 시도 횟수에서 lease 또는 재시도 기한이 만료되었습니다.",
        deadAt: now,
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount;
}

export async function sweepExpiredWorkerLeases(
  input: SweepExpiredWorkerLeasesInput = {},
): Promise<{
  scheduledJobRunsDead: number;
  integrationOutboxDead: number;
}> {
  const now = input.now ?? new Date();
  const [scheduledJobRunsDead, integrationOutboxDead] =
    await Promise.all([
      reapExpiredScheduledJobRuns({
        now,
        maxAttempts: input.scheduledMaxAttempts,
      }),
      reapExpiredIntegrationOutbox({
        now,
        maxAttempts: input.outboxMaxAttempts,
      }),
    ]);
  return { scheduledJobRunsDead, integrationOutboxDead };
}

export async function getWorkerCheckpoint(
  name: string,
): Promise<WorkerCheckpoint | null> {
  const col = await workerCheckpointsCol();
  return col.findOne({ name });
}

export async function saveWorkerCheckpoint(
  name: string,
  resumeToken: unknown,
): Promise<void> {
  const col = await workerCheckpointsCol();
  await col.updateOne(
    { name },
    {
      $set: { resumeToken, updatedAt: new Date() },
      $setOnInsert: { name },
    },
    { upsert: true },
  );
}

export async function clearWorkerCheckpoint(name: string): Promise<boolean> {
  const col = await workerCheckpointsCol();
  const result = await col.deleteOne({ name });
  return result.deletedCount === 1;
}
