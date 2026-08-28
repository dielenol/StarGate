import { createHash } from "node:crypto";

import {
  HONOR_LORE_REVIEW_REVISION,
  assertHonorRecordInvariants,
  type HonorCharacterIdentity,
  type HonorRecord,
  type SessionReport,
  type UpsertHonorRecordInput,
} from "@stargate/shared-db";

export const HALL_OF_FAME_BACKFILL_MANIFEST_VERSION = 2 as const;
const BACKFILL_ANALYZER_REVISIONS = new Set<string>([
  HONOR_LORE_REVIEW_REVISION,
]);

export interface SerializedHonorRecord
  extends Omit<
    UpsertHonorRecordInput,
    "occurredAt" | "issuedAt" | "updatedAt"
  > {
  occurredAt: string;
  issuedAt: string;
  updatedAt: string;
}

export interface HallOfFameNovexManifestEntry {
  seasonId: string;
  sourceFingerprint: string;
  records: SerializedHonorRecord[];
}

export interface HallOfFameOperationManifestEntry {
  sourceKey: string;
  sourceRecordId: string;
  sourceRevision: string;
  sourceHash: string;
  records: SerializedHonorRecord[];
}

export interface HallOfFameBackfillSkippedSource {
  domain: "OPERATION";
  sourceKey: string;
  sourceRecordId: string;
  sourceRevision: string;
  sourceFingerprint: string;
  reason: "NO_ELIGIBLE_AGENT" | "NO_ANALYZABLE_TEXT";
}

export interface HallOfFameBackfillIssue {
  domain: "NOVEX" | "OPERATION";
  sourceKey: string;
  code: string;
}

export interface HallOfFameBackfillManifestBody {
  schemaVersion: typeof HALL_OF_FAME_BACKFILL_MANIFEST_VERSION;
  analyzerRevision: string;
  generatedAt: string;
  database: string;
  novex: HallOfFameNovexManifestEntry[];
  operations: HallOfFameOperationManifestEntry[];
  skipped: HallOfFameBackfillSkippedSource[];
  issues: HallOfFameBackfillIssue[];
}

export interface HallOfFameBackfillManifest
  extends HallOfFameBackfillManifestBody {
  manifestHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireString(
  value: unknown,
  field: string,
  options: { pattern?: RegExp; maxLength?: number } = {},
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    (options.maxLength !== undefined && value.length > options.maxLength) ||
    (options.pattern && !options.pattern.test(value))
  ) {
    throw new Error(`HALL_OF_FAME_MANIFEST_${field}_INVALID`);
  }
  return value;
}

function requireIsoDate(value: unknown, field: string): string {
  const raw = requireString(value, field, { maxLength: 64 });
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== raw) {
    throw new Error(`HALL_OF_FAME_MANIFEST_${field}_INVALID`);
  }
  return raw;
}

function requireAnalyzerRevision(value: unknown): string {
  const revision = requireString(value, "ANALYZER_REVISION", {
    maxLength: 120,
  });
  if (!BACKFILL_ANALYZER_REVISIONS.has(revision)) {
    throw new Error("HALL_OF_FAME_MANIFEST_ANALYZER_REVISION_INVALID");
  }
  return revision;
}

export function serializeHonorRecord(
  record: UpsertHonorRecordInput,
): SerializedHonorRecord {
  assertHonorRecordInvariants(record);
  return {
    ...record,
    occurredAt: record.occurredAt.toISOString(),
    issuedAt: record.issuedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function deserializeHonorRecord(
  value: unknown,
): UpsertHonorRecordInput {
  if (!isRecord(value)) {
    throw new Error("HALL_OF_FAME_MANIFEST_RECORD_INVALID");
  }
  const occurredAt = new Date(requireIsoDate(value.occurredAt, "OCCURRED_AT"));
  const issuedAt = new Date(requireIsoDate(value.issuedAt, "ISSUED_AT"));
  const updatedAt = new Date(requireIsoDate(value.updatedAt, "UPDATED_AT"));
  const record = {
    ...value,
    occurredAt,
    issuedAt,
    updatedAt,
  } as unknown as UpsertHonorRecordInput;
  assertHonorRecordInvariants(record);
  return record;
}

export function buildNovexSourceFingerprint(
  records: readonly Pick<
    UpsertHonorRecordInput,
    | "logicalKey"
    | "publicKey"
    | "sourceHash"
    | "codenameSnapshot"
    | "title"
    | "citation"
    | "rank"
    | "source"
  >[],
): string {
  return sha256(
    stableJson(
      [...records]
        .sort((left, right) => left.logicalKey.localeCompare(right.logicalKey))
        .map((record) => ({
          logicalKey: record.logicalKey,
          publicKey: record.publicKey,
          sourceHash: record.sourceHash,
          codenameSnapshot: record.codenameSnapshot,
          title: record.title,
          citation: record.citation,
          rank: record.rank,
          source: record.source,
        })),
    ),
  );
}

export function buildHonorRecordMaterializationFingerprint(
  record: HonorRecord | UpsertHonorRecordInput,
): string {
  return sha256(
    stableJson({
      logicalKey: record.logicalKey,
      publicKey: record.publicKey,
      domain: record.domain,
      category: record.category,
      characterId: record.characterId,
      codenameSnapshot: record.codenameSnapshot,
      title: record.title,
      citation: record.citation,
      rank: record.rank,
      source: record.source,
      sourceHash: record.sourceHash,
      analyzerRevision: record.analyzerRevision,
      minRole: record.minRole,
      evidenceAudit: record.evidenceAudit,
      status: record.status,
      occurredAt: record.occurredAt.toISOString(),
    }),
  );
}

/** 분석 source를 만들 수 없는 U 보고서도 apply 시점 변경을 감지하는 비공개 hash. */
export function buildSkippedOperationSourceFingerprint(input: {
  report: Pick<
    SessionReport,
    | "_id"
    | "sessionId"
    | "minRole"
    | "summary"
    | "highlights"
    | "relatedPersonnelCodenames"
    | "updatedAt"
  >;
  characters: readonly HonorCharacterIdentity[];
}): string {
  return sha256(
    stableJson({
      sourceRecordId: String(input.report._id ?? ""),
      sourceKey: input.report.sessionId,
      sourceRevision: input.report.updatedAt.toISOString(),
      minRole: input.report.minRole ?? "U",
      summary: input.report.summary,
      highlights: input.report.highlights,
      relatedPersonnelCodenames: [
        ...(input.report.relatedPersonnelCodenames ?? []),
      ].sort(),
      characters: input.characters
        .map((character) => ({
          id: String(character._id ?? ""),
          type: character.type,
          ownerId: character.ownerId,
          codename: character.codename,
        }))
        .sort((left, right) =>
          `${left.codename}:${left.id}`.localeCompare(
            `${right.codename}:${right.id}`,
          ),
        ),
    }),
  );
}

export function createHallOfFameBackfillManifest(
  input: Omit<HallOfFameBackfillManifestBody, "schemaVersion" | "analyzerRevision"> & {
    analyzerRevision?: string;
  },
): HallOfFameBackfillManifest {
  const analyzerRevision = requireAnalyzerRevision(
    input.analyzerRevision ?? HONOR_LORE_REVIEW_REVISION,
  );
  const body: HallOfFameBackfillManifestBody = {
    schemaVersion: HALL_OF_FAME_BACKFILL_MANIFEST_VERSION,
    analyzerRevision,
    generatedAt: requireIsoDate(input.generatedAt, "GENERATED_AT"),
    database: requireString(input.database, "DATABASE", { maxLength: 120 }),
    novex: [...input.novex].sort((left, right) =>
      left.seasonId.localeCompare(right.seasonId),
    ),
    operations: [...input.operations].sort((left, right) =>
      left.sourceKey.localeCompare(right.sourceKey),
    ),
    skipped: [...input.skipped].sort((left, right) =>
      left.sourceKey.localeCompare(right.sourceKey),
    ),
    issues: [...input.issues].sort((left, right) =>
      `${left.domain}:${left.sourceKey}:${left.code}`.localeCompare(
        `${right.domain}:${right.sourceKey}:${right.code}`,
      ),
    ),
  };
  return { ...body, manifestHash: sha256(stableJson(body)) };
}

function parseSerializedRecords(
  value: unknown,
  expected: { domain: "NOVEX" | "OPERATION"; sourceKey: string },
): SerializedHonorRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("HALL_OF_FAME_MANIFEST_RECORDS_INVALID");
  }
  if (expected.domain === "NOVEX" && value.length > 3) {
    throw new Error("HALL_OF_FAME_MANIFEST_NOVEX_LIMIT_INVALID");
  }
  if (expected.domain === "OPERATION" && value.length > 3) {
    throw new Error("HALL_OF_FAME_MANIFEST_OPERATION_LIMIT_INVALID");
  }
  const parsed = value.map((record) => {
    const deserialized = deserializeHonorRecord(record);
    if (
      deserialized.domain !== expected.domain ||
      deserialized.source.key !== expected.sourceKey
    ) {
      throw new Error("HALL_OF_FAME_MANIFEST_RECORD_SOURCE_MISMATCH");
    }
    return serializeHonorRecord(deserialized);
  });
  const logicalKeys = new Set(parsed.map((record) => record.logicalKey));
  const characterIds = new Set(parsed.map((record) => record.characterId));
  if (
    logicalKeys.size !== parsed.length ||
    characterIds.size !== parsed.length
  ) {
    throw new Error("HALL_OF_FAME_MANIFEST_RECORD_DUPLICATE");
  }
  return parsed;
}

export function parseHallOfFameBackfillManifest(
  value: unknown,
): HallOfFameBackfillManifest {
  if (!isRecord(value)) {
    throw new Error("HALL_OF_FAME_MANIFEST_INVALID");
  }
  if (
    value.schemaVersion !== HALL_OF_FAME_BACKFILL_MANIFEST_VERSION ||
    !Array.isArray(value.novex) ||
    !Array.isArray(value.operations) ||
    !Array.isArray(value.skipped) ||
    !Array.isArray(value.issues)
  ) {
    throw new Error("HALL_OF_FAME_MANIFEST_SCHEMA_INVALID");
  }
  const analyzerRevision = requireAnalyzerRevision(value.analyzerRevision);
  const generatedAt = requireIsoDate(value.generatedAt, "GENERATED_AT");
  const database = requireString(value.database, "DATABASE", {
    maxLength: 120,
  });
  const novex = value.novex.map((entry): HallOfFameNovexManifestEntry => {
    if (!isRecord(entry)) {
      throw new Error("HALL_OF_FAME_MANIFEST_NOVEX_INVALID");
    }
    const seasonId = requireString(entry.seasonId, "SEASON_ID", {
      maxLength: 200,
    });
    const records = parseSerializedRecords(entry.records, {
      domain: "NOVEX",
      sourceKey: seasonId,
    });
    const sourceFingerprint = requireString(
      entry.sourceFingerprint,
      "NOVEX_FINGERPRINT",
      { pattern: /^[a-f0-9]{64}$/u },
    );
    if (sourceFingerprint !== buildNovexSourceFingerprint(records)) {
      throw new Error("HALL_OF_FAME_MANIFEST_NOVEX_FINGERPRINT_MISMATCH");
    }
    return { seasonId, sourceFingerprint, records };
  });
  const operations = value.operations.map(
    (entry): HallOfFameOperationManifestEntry => {
      if (!isRecord(entry)) {
        throw new Error("HALL_OF_FAME_MANIFEST_OPERATION_INVALID");
      }
      const sourceKey = requireString(entry.sourceKey, "SOURCE_KEY", {
        maxLength: 200,
      });
      const sourceRecordId = requireString(
        entry.sourceRecordId,
        "SOURCE_RECORD_ID",
        { maxLength: 200 },
      );
      const sourceHash = requireString(entry.sourceHash, "SOURCE_HASH", {
        pattern: /^[a-f0-9]{64}$/u,
      });
      const sourceRevision = requireIsoDate(
        entry.sourceRevision,
        "SOURCE_REVISION",
      );
      const records = parseSerializedRecords(entry.records, {
        domain: "OPERATION",
        sourceKey,
      });
      if (
        records.some(
          (record) =>
            record.sourceHash !== sourceHash ||
            record.source.recordId !== sourceRecordId ||
            record.analyzerRevision !== analyzerRevision,
        )
      ) {
        throw new Error("HALL_OF_FAME_MANIFEST_OPERATION_HASH_MISMATCH");
      }
      return {
        sourceKey,
        sourceRecordId,
        sourceRevision,
        sourceHash,
        records,
      };
    },
  );
  const skipped = value.skipped.map(
    (entry): HallOfFameBackfillSkippedSource => {
      if (
        !isRecord(entry) ||
        entry.domain !== "OPERATION" ||
        (entry.reason !== "NO_ELIGIBLE_AGENT" &&
          entry.reason !== "NO_ANALYZABLE_TEXT")
      ) {
        throw new Error("HALL_OF_FAME_MANIFEST_SKIPPED_INVALID");
      }
      return {
        domain: "OPERATION",
        sourceKey: requireString(entry.sourceKey, "SOURCE_KEY", {
          maxLength: 200,
        }),
        sourceRecordId: requireString(
          entry.sourceRecordId,
          "SOURCE_RECORD_ID",
          { maxLength: 200 },
        ),
        sourceRevision: requireIsoDate(
          entry.sourceRevision,
          "SOURCE_REVISION",
        ),
        sourceFingerprint: requireString(
          entry.sourceFingerprint,
          "SOURCE_FINGERPRINT",
          { pattern: /^[a-f0-9]{64}$/u },
        ),
        reason: entry.reason,
      };
    },
  );
  const issues = value.issues.map((entry): HallOfFameBackfillIssue => {
    if (
      !isRecord(entry) ||
      (entry.domain !== "NOVEX" && entry.domain !== "OPERATION")
    ) {
      throw new Error("HALL_OF_FAME_MANIFEST_ISSUE_INVALID");
    }
    return {
      domain: entry.domain,
      sourceKey: requireString(entry.sourceKey, "SOURCE_KEY", {
        maxLength: 200,
      }),
      code: requireString(entry.code, "ISSUE_CODE", {
        pattern: /^[A-Z0-9_]+$/u,
        maxLength: 120,
      }),
    };
  });
  const body: HallOfFameBackfillManifestBody = {
    schemaVersion: HALL_OF_FAME_BACKFILL_MANIFEST_VERSION,
    analyzerRevision,
    generatedAt,
    database,
    novex,
    operations,
    skipped,
    issues,
  };
  const manifestHash = requireString(value.manifestHash, "HASH", {
    pattern: /^[a-f0-9]{64}$/u,
  });
  if (manifestHash !== sha256(stableJson(body))) {
    throw new Error("HALL_OF_FAME_MANIFEST_HASH_MISMATCH");
  }
  const sourceKeys = [
    ...novex.map((entry) => `NOVEX:${entry.seasonId}`),
    ...operations.map((entry) => `OPERATION:${entry.sourceKey}`),
    ...skipped.map((entry) => `OPERATION:${entry.sourceKey}`),
  ];
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error("HALL_OF_FAME_MANIFEST_SOURCE_DUPLICATE");
  }
  const publicKeys = [
    ...novex.flatMap((entry) => entry.records.map((record) => record.publicKey)),
    ...operations.flatMap((entry) =>
      entry.records.map((record) => record.publicKey),
    ),
  ];
  if (new Set(publicKeys).size !== publicKeys.length) {
    throw new Error("HALL_OF_FAME_MANIFEST_PUBLIC_KEY_DUPLICATE");
  }
  return { ...body, manifestHash };
}

export function deserializeManifestRecords(
  records: readonly SerializedHonorRecord[],
): UpsertHonorRecordInput[] {
  return records.map(deserializeHonorRecord);
}
