import type { Collection, Document } from "mongodb";

import { loreIngestionRunSchema } from "@stargate/shared-db/schemas";
import type {
  LoreIngestionRun,
  LoreIngestionStats,
} from "@stargate/shared-db/types";

export const INGESTION_RUN_LEASE_MS = 30 * 60 * 1_000;

export function ingestionLeaseFields(now = new Date()): {
  heartbeatAt: Date;
  leaseExpiresAt: Date;
} {
  return {
    heartbeatAt: now,
    leaseExpiresAt: new Date(now.getTime() + INGESTION_RUN_LEASE_MS),
  };
}

function nonnegativeInteger(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function expiredIngestionStats(value: unknown): LoreIngestionStats {
  const current = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const written = nonnegativeInteger(current.written);
  const skipped = nonnegativeInteger(current.skipped);
  const blocked = nonnegativeInteger(current.blocked);
  const failed = nonnegativeInteger(current.failed) + 1;
  const processed = Math.max(
    nonnegativeInteger(current.processed),
    written + skipped + blocked + failed,
  );
  return {
    discovered: Math.max(nonnegativeInteger(current.discovered), processed),
    processed,
    written,
    skipped,
    blocked,
    failed,
  };
}

export function buildExpiredIngestionRun(
  value: Document,
  now = new Date(),
): LoreIngestionRun {
  const {
    _id,
    leaseExpiresAt,
    ...current
  } = value;
  void _id;
  void leaseExpiresAt;
  const errors = Array.isArray(current.errors) ? current.errors : [];
  return loreIngestionRunSchema.parse({
    ...current,
    status: "failed",
    stats: expiredIngestionStats(current.stats),
    errors: [
      ...errors,
      {
        code: "INGESTION_LEASE_EXPIRED",
        message: "이전 실행의 lease가 만료되어 crash/강제종료로 판정했습니다.",
      },
    ].slice(-1_000),
    completedAt: now,
    heartbeatAt: now,
    updatedAt: now,
  }) as LoreIngestionRun;
}

function expiredRunFilter(mode: string, now: Date): Document {
  const legacyCutoff = new Date(now.getTime() - INGESTION_RUN_LEASE_MS);
  return {
    mode,
    status: "running",
    $or: [
      { leaseExpiresAt: { $lte: now } },
      {
        leaseExpiresAt: { $exists: false },
        startedAt: { $lte: legacyCutoff },
      },
      {
        leaseExpiresAt: { $exists: false },
        startedAt: { $exists: false },
        createdAt: { $lte: legacyCutoff },
      },
    ],
  };
}

/** Convert abandoned running audits into a terminal, machine-visible failure. */
export async function reconcileExpiredIngestionRuns(
  collection: Collection<Document>,
  mode: string,
  now = new Date(),
): Promise<number> {
  const filter = expiredRunFilter(mode, now);
  const expired = await collection.find(filter).toArray();
  let modifiedCount = 0;
  for (const current of expired) {
    const candidate = buildExpiredIngestionRun(current, now);
    const result = await collection.updateOne(
      { _id: current._id, ...filter },
      {
        $set: {
          status: candidate.status,
          stats: candidate.stats,
          errors: candidate.errors,
          completedAt: candidate.completedAt,
          heartbeatAt: candidate.heartbeatAt,
          updatedAt: candidate.updatedAt,
        },
        $unset: { leaseExpiresAt: "" },
      },
    );
    modifiedCount += result.modifiedCount;
  }
  return modifiedCount;
}
