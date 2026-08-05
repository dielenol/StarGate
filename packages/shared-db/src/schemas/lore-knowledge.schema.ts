import { z } from "zod";

import {
  LORE_ALIAS_TYPES,
  LORE_ENTITY_KINDS,
  LORE_INGESTION_MODES,
  LORE_INGESTION_STATUSES,
  LORE_LINEAGE_STATES,
  LORE_RECORD_STATUSES,
  LORE_SOURCE_KINDS,
  LORE_SOURCE_LOCATOR_KINDS,
  LORE_VISIBILITIES,
  type LoreEntityKind,
  type LoreEntityRef,
  type LoreSourceKind,
  type LoreSourceLocatorKind,
} from "../types/lore-knowledge.js";
import { ROLE_LEVELS } from "../types/character.js";

import { dateSchema } from "./common.js";

const ENTITY_KIND_PATTERN = LORE_ENTITY_KINDS.join("|");
const ENTITY_REF_RE = new RegExp(
  `^(?:${ENTITY_KIND_PATTERN}):[A-Za-z0-9가-힣][A-Za-z0-9가-힣._/-]{0,159}$`,
);
const STABLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const FACET_KEY_RE = /^[a-z][a-zA-Z0-9]{0,39}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const EXPECTED_SOURCE_LOCATOR: Partial<
  Record<LoreSourceKind, LoreSourceLocatorKind>
> = {
  "database-record": "database",
  "repository-document": "repository-path",
  "session-log": "session",
  "public-route": "route",
};

export const loreStableIdSchema = z
  .string()
  .regex(STABLE_ID_RE, "stable id는 영숫자로 시작하며 . _ : - 만 허용합니다");

const sha256Schema = z
  .string()
  .regex(SHA256_RE, "SHA-256은 소문자 64자리 16진수여야 합니다");

function uniqueArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z
    .array(item)
    .max(max)
    .refine(
      (values) => new Set(values.map((value) => JSON.stringify(value))).size === values.length,
      "중복 값을 허용하지 않습니다",
    );
}

export const loreEntityKindSchema = z.enum(LORE_ENTITY_KINDS);

/** Canonical graph key: `<known-kind>:<stable-operational-key>`. */
export const loreEntityRefSchema = z
  .string()
  .max(192)
  .regex(ENTITY_REF_RE, "canonical entity ref는 kind:key 형식이어야 합니다")
  .transform((value) => value as LoreEntityRef);

export function buildLoreEntityRef(
  kind: LoreEntityKind,
  key: string,
): LoreEntityRef {
  return loreEntityRefSchema.parse(`${kind}:${key}`);
}

export function parseLoreEntityRef(ref: string): {
  kind: LoreEntityKind;
  key: string;
} {
  const parsed = loreEntityRefSchema.parse(ref);
  const separator = parsed.indexOf(":");
  return {
    kind: parsed.slice(0, separator) as LoreEntityKind,
    key: parsed.slice(separator + 1),
  };
}

export const loreRecordStatusSchema = z.enum(LORE_RECORD_STATUSES);
export const loreVisibilitySchema = z.enum(LORE_VISIBILITIES);

const roleSchema = z.enum(ROLE_LEVELS);

export const loreAccessSchema = z
  .object({
    visibility: loreVisibilitySchema,
    allowedRoles: uniqueArray(roleSchema, ROLE_LEVELS.length).optional(),
    allowedUserIds: uniqueArray(z.string().min(1).max(128), 100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasRestriction =
      (value.allowedRoles?.length ?? 0) > 0 ||
      (value.allowedUserIds?.length ?? 0) > 0;
    if (value.visibility === "restricted" && !hasRestriction) {
      ctx.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "restricted visibility에는 allowedRoles 또는 allowedUserIds가 필요합니다",
      });
    }
    if (value.visibility !== "restricted" && hasRestriction) {
      ctx.addIssue({
        code: "custom",
        path: ["visibility"],
        message: "role/user allowlist는 restricted visibility에서만 사용할 수 있습니다",
      });
    }
  });

export const loreSourceKindSchema = z.enum(LORE_SOURCE_KINDS);
export const loreSourceLocatorKindSchema = z.enum(LORE_SOURCE_LOCATOR_KINDS);

export const loreSourceLocatorSchema = z
  .object({
    kind: loreSourceLocatorKindSchema,
    value: z.string().min(1).max(500),
    anchor: z.string().min(1).max(300).optional(),
  })
  .strict();

export const loreEvidenceRefSchema = z
  .object({
    sourceId: loreStableIdSchema,
    locator: z.string().min(1).max(500).optional(),
    excerptHash: sha256Schema.optional(),
    note: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export const loreLineageStateSchema = z.enum(LORE_LINEAGE_STATES);

export const loreLineageSchema = z
  .object({
    state: loreLineageStateSchema,
    supersedesIds: uniqueArray(loreStableIdSchema, 100).optional(),
    supersededById: loreStableIdSchema.optional(),
    retconReason: z.string().min(1).max(1_000).optional(),
    retconnedAt: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === "active" && (value.supersededById || value.retconnedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "active lineage에는 supersededById/retconnedAt을 둘 수 없습니다",
      });
    }
    if (value.state === "superseded" && !value.supersededById) {
      ctx.addIssue({
        code: "custom",
        path: ["supersededById"],
        message: "superseded lineage에는 successor id가 필요합니다",
      });
    }
    if (value.state === "retconned" && (!value.retconReason || !value.retconnedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["retconReason"],
        message: "retconned lineage에는 사유와 시각이 필요합니다",
      });
    }
    if (value.state === "retconned" && value.supersededById) {
      ctx.addIssue({
        code: "custom",
        path: ["supersededById"],
        message: "retconned lineage에는 successor를 둘 수 없습니다",
      });
    }
    if (value.state !== "retconned" && (value.retconReason || value.retconnedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "retcon 메타데이터는 retconned lineage에서만 사용할 수 있습니다",
      });
    }
  });

const temporalRangeFields = {
  validFrom: dateSchema.optional(),
  validUntil: dateSchema.optional(),
};

function validateTemporalRange(
  value: { validFrom?: Date; validUntil?: Date },
  ctx: z.RefinementCtx,
) {
  if (value.validFrom && value.validUntil && value.validFrom > value.validUntil) {
    ctx.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "validUntil은 validFrom보다 빠를 수 없습니다",
    });
  }
}

function validateLineageSelfReference(
  id: string,
  lineage: { supersedesIds?: string[]; supersededById?: string },
  ctx: z.RefinementCtx,
) {
  if (lineage.supersedesIds?.includes(id) || lineage.supersededById === id) {
    ctx.addIssue({
      code: "custom",
      path: ["lineage"],
      message: "lineage는 자기 자신의 id를 참조할 수 없습니다",
    });
  }
}

const documentMetadataFields = {
  createdAt: dateSchema,
  updatedAt: dateSchema,
};

export const loreSourceDocumentSchema = z
  .object({
    sourceId: loreStableIdSchema,
    kind: loreSourceKindSchema,
    title: z.string().min(1).max(200),
    locator: loreSourceLocatorSchema,
    contentHash: sha256Schema.optional(),
    parentSourceId: loreStableIdSchema.optional(),
    parentSourceIds: uniqueArray(loreStableIdSchema, 200).optional(),
    sessionId: z.string().min(1).max(160).optional(),
    ingestionRunId: loreStableIdSchema.optional(),
    access: loreAccessSchema,
    capturedAt: dateSchema,
    ...documentMetadataFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.parentSourceId === value.sourceId) {
      ctx.addIssue({
        code: "custom",
        path: ["parentSourceId"],
        message: "source는 자기 자신을 parent로 가질 수 없습니다",
      });
    }
    if (value.parentSourceIds?.includes(value.sourceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["parentSourceIds"],
        message: "source는 자기 자신을 parents에 포함할 수 없습니다",
      });
    }
    if (value.parentSourceId && value.parentSourceIds) {
      ctx.addIssue({
        code: "custom",
        path: ["parentSourceIds"],
        message: "parentSourceId와 parentSourceIds는 함께 사용할 수 없습니다",
      });
    }
    const hashedKinds = new Set([
      "database-record",
      "repository-document",
      "session-log",
      "containment-archive",
      "public-route",
      "legacy-import",
    ]);
    if (hashedKinds.has(value.kind) && !value.contentHash) {
      ctx.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "재수집 가능한 source에는 contentHash가 필요합니다",
      });
    }
    const expectedLocator = EXPECTED_SOURCE_LOCATOR[value.kind];
    if (expectedLocator && value.locator.kind !== expectedLocator) {
      ctx.addIssue({
        code: "custom",
        path: ["locator", "kind"],
        message: `${value.kind} source의 locator kind는 ${expectedLocator}여야 합니다`,
      });
    }
    if (value.kind === "session-log" && !value.sessionId) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionId"],
        message: "session-log source에는 sessionId가 필요합니다",
      });
    }
    if (
      value.access.visibility === "public" &&
      !["route", "external"].includes(value.locator.kind)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["access", "visibility"],
        message: "private audit locator를 가진 source는 public으로 노출할 수 없습니다",
      });
    }
  });

export const loreAliasTypeSchema = z.enum(LORE_ALIAS_TYPES);

export function normalizeLoreAlias(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

export function buildLoreAliasLogicalKey(value: {
  entityRef: string;
  aliasType: string;
  normalizedAlias: string;
}): string {
  return `${value.entityRef}|${value.aliasType}|${value.normalizedAlias}`;
}

export function buildLoreEdgeLogicalKey(value: {
  fromRef: string;
  relation: string;
  toRef: string;
}): string {
  return `${value.fromRef}|${value.relation}|${value.toRef}`;
}

export function buildLoreClaimLogicalKey(value: {
  subjectRef: string;
  predicate: string;
}): string {
  return `${value.subjectRef}|${value.predicate}`;
}

export const loreAliasSchema = z
  .object({
    aliasId: loreStableIdSchema,
    entityRef: loreEntityRefSchema,
    alias: z.string().min(1).max(200),
    normalizedAlias: z.string().min(1).max(200),
    aliasType: loreAliasTypeSchema,
    logicalKey: z.string().min(1).max(600),
    language: z.string().min(2).max(20).optional(),
    status: loreRecordStatusSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(loreEvidenceRefSchema).min(1).max(100),
    lineage: loreLineageSchema,
    access: loreAccessSchema,
    ...temporalRangeFields,
    ...documentMetadataFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.normalizedAlias !== normalizeLoreAlias(value.alias)) {
      ctx.addIssue({
        code: "custom",
        path: ["normalizedAlias"],
        message: "normalizedAlias는 normalizeLoreAlias(alias) 결과와 일치해야 합니다",
      });
    }
    if (value.logicalKey !== buildLoreAliasLogicalKey(value)) {
      ctx.addIssue({ code: "custom", path: ["logicalKey"], message: "alias logicalKey 불일치" });
    }
    validateTemporalRange(value, ctx);
    validateLineageSelfReference(value.aliasId, value.lineage, ctx);
  });

export const loreEdgeSchema = z
  .object({
    edgeId: loreStableIdSchema,
    fromRef: loreEntityRefSchema,
    relation: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/, "relation은 kebab-case여야 합니다"),
    toRef: loreEntityRefSchema,
    logicalKey: z.string().min(1).max(600),
    status: loreRecordStatusSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(loreEvidenceRefSchema).min(1).max(100),
    lineage: loreLineageSchema,
    access: loreAccessSchema,
    ...temporalRangeFields,
    ...documentMetadataFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fromRef === value.toRef && value.relation === "same-as") {
      ctx.addIssue({
        code: "custom",
        path: ["toRef"],
        message: "same-as edge는 자기 자신을 가리킬 수 없습니다",
      });
    }
    if (value.logicalKey !== buildLoreEdgeLogicalKey(value)) {
      ctx.addIssue({ code: "custom", path: ["logicalKey"], message: "edge logicalKey 불일치" });
    }
    validateTemporalRange(value, ctx);
    validateLineageSelfReference(value.edgeId, value.lineage, ctx);
  });

export const loreClaimSchema = z
  .object({
    claimId: loreStableIdSchema,
    subjectRef: loreEntityRefSchema,
    predicate: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z][a-z0-9.-]*$/, "predicate는 lower kebab/dot-case여야 합니다"),
    logicalKey: z.string().min(1).max(600),
    value: z.json(),
    status: loreRecordStatusSchema,
    confidence: z.number().min(0).max(1),
    evidence: z.array(loreEvidenceRefSchema).min(1).max(100),
    lineage: loreLineageSchema,
    access: loreAccessSchema,
    ...temporalRangeFields,
    ...documentMetadataFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.logicalKey !== buildLoreClaimLogicalKey(value)) {
      ctx.addIssue({ code: "custom", path: ["logicalKey"], message: "claim logicalKey 불일치" });
    }
    validateTemporalRange(value, ctx);
    validateLineageSelfReference(value.claimId, value.lineage, ctx);
  });

const facetStringSchema = z.string().min(1).max(120);

export const loreSearchFacetsSchema = z
  .object({
    categories: uniqueArray(facetStringSchema, 50).optional(),
    tags: uniqueArray(facetStringSchema, 100).optional(),
    factionCodes: uniqueArray(facetStringSchema, 50).optional(),
    institutionCodes: uniqueArray(facetStringSchema, 50).optional(),
    sessionIds: uniqueArray(facetStringSchema, 100).optional(),
    itemCategories: uniqueArray(facetStringSchema, 50).optional(),
    sourceKinds: uniqueArray(loreSourceKindSchema, LORE_SOURCE_KINDS.length).optional(),
    statuses: uniqueArray(loreRecordStatusSchema, LORE_RECORD_STATUSES.length).optional(),
    custom: z
      .record(
        z.string().regex(FACET_KEY_RE, "custom facet key는 lowerCamelCase여야 합니다"),
        uniqueArray(facetStringSchema, 100),
      )
      .refine((value) => Object.keys(value).length <= 30, "custom facet은 30개 이하만 허용합니다")
      .optional(),
  })
  .strict();

export const loreSearchDocumentSchema = z
  .object({
    entityRef: loreEntityRefSchema,
    entityKind: loreEntityKindSchema,
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(300).optional(),
    summary: z.string().min(1).max(2_000).optional(),
    aliases: uniqueArray(z.string().min(1).max(200), 100),
    searchText: z.string().min(1).max(100_000),
    facets: loreSearchFacetsSchema,
    status: loreRecordStatusSchema,
    sourceIds: uniqueArray(loreStableIdSchema, 100).min(1),
    access: loreAccessSchema,
    contentHash: sha256Schema,
    projectionVersion: z.number().int().positive(),
    projectionOwner: loreStableIdSchema,
    sourceUpdatedAt: dateSchema,
    ...documentMetadataFields,
  })
  .strict()
  .refine((value) => value.entityRef.startsWith(`${value.entityKind}:`), {
    path: ["entityRef"],
    message: "entityRef kind와 entityKind가 일치해야 합니다",
  });

export const loreIngestionModeSchema = z.enum(LORE_INGESTION_MODES);
export const loreIngestionStatusSchema = z.enum(LORE_INGESTION_STATUSES);

export const loreSearchQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(500).optional(),
    entityKinds: uniqueArray(loreEntityKindSchema, LORE_ENTITY_KINDS.length).optional(),
    statuses: uniqueArray(loreRecordStatusSchema, LORE_RECORD_STATUSES.length).optional(),
    categories: uniqueArray(facetStringSchema, 50).optional(),
    tags: uniqueArray(facetStringSchema, 100).optional(),
    factionCodes: uniqueArray(facetStringSchema, 50).optional(),
    institutionCodes: uniqueArray(facetStringSchema, 50).optional(),
    sessionIds: uniqueArray(facetStringSchema, 100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const loreIngestionStatsSchema = z
  .object({
    discovered: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    written: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.processed > value.discovered) {
      ctx.addIssue({
        code: "custom",
        path: ["processed"],
        message: "processed는 discovered를 초과할 수 없습니다",
      });
    }
    const resolved = value.written + value.skipped + value.blocked + value.failed;
    if (resolved > value.processed) {
      ctx.addIssue({
        code: "custom",
        path: ["written"],
        message: "처리 결과 합계는 processed를 초과할 수 없습니다",
      });
    }
  });

export const loreIngestionErrorSchema = z
  .object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(2_000),
    entityRef: loreEntityRefSchema.optional(),
    sourceId: loreStableIdSchema.optional(),
  })
  .strict();

const TERMINAL_INGESTION_STATUSES = new Set([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

export const loreIngestionRunSchema = z
  .object({
    runId: loreStableIdSchema,
    mode: loreIngestionModeSchema,
    status: loreIngestionStatusSchema,
    dryRun: z.boolean(),
    sourceIds: uniqueArray(loreStableIdSchema, 1_000),
    manifestHash: sha256Schema.optional(),
    parserVersion: z.string().min(1).max(100).optional(),
    stats: loreIngestionStatsSchema,
    errors: z.array(loreIngestionErrorSchema).max(1_000),
    startedAt: dateSchema.optional(),
    heartbeatAt: dateSchema.optional(),
    leaseExpiresAt: dateSchema.optional(),
    completedAt: dateSchema.optional(),
    ...documentMetadataFields,
  })
  .strict()
  .superRefine((value, ctx) => {
    const terminal = TERMINAL_INGESTION_STATUSES.has(value.status);
    if (value.status === "running" && !value.startedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["startedAt"],
        message: "running ingestion에는 startedAt이 필요합니다",
      });
    }
    if (value.status === "running" && (!value.heartbeatAt || !value.leaseExpiresAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["leaseExpiresAt"],
        message: "running ingestion에는 heartbeat/lease가 필요합니다",
      });
    }
    if (
      value.heartbeatAt &&
      value.leaseExpiresAt &&
      value.leaseExpiresAt <= value.heartbeatAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["leaseExpiresAt"],
        message: "ingestion lease는 heartbeat 이후여야 합니다",
      });
    }
    if (terminal && !value.completedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "terminal ingestion에는 completedAt이 필요합니다",
      });
    }
    if (!terminal && value.completedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "planned/running ingestion에는 completedAt을 둘 수 없습니다",
      });
    }
    if (value.startedAt && value.completedAt && value.startedAt > value.completedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "completedAt은 startedAt보다 빠를 수 없습니다",
      });
    }
    if (value.status === "succeeded" && (value.stats.blocked > 0 || value.stats.failed > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "blocked/failed 항목이 있으면 succeeded로 완료할 수 없습니다",
      });
    }
    if (value.status === "succeeded") {
      const resolved =
        value.stats.written +
        value.stats.skipped +
        value.stats.blocked +
        value.stats.failed;
      if (
        value.stats.processed !== value.stats.discovered ||
        resolved !== value.stats.processed ||
        value.errors.length > 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "succeeded ingestion은 모든 발견 항목이 오류 없이 해결되어야 합니다",
        });
      }
    }
    if (value.status === "failed" && value.errors.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["errors"],
        message: "failed ingestion에는 최소 한 개의 오류가 필요합니다",
      });
    }
    if (
      value.status !== "planned" &&
      ["session-ingestion", "worldbuilding-library"].includes(value.mode) &&
      value.sourceIds.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceIds"],
        message: "근거 기반 ingestion 실행에는 최소 한 개의 source가 필요합니다",
      });
    }
  });

export type LoreSourceDocumentSchema = z.infer<typeof loreSourceDocumentSchema>;
export type LoreAliasSchema = z.infer<typeof loreAliasSchema>;
export type LoreEdgeSchema = z.infer<typeof loreEdgeSchema>;
export type LoreClaimSchema = z.infer<typeof loreClaimSchema>;
export type LoreSearchDocumentSchema = z.infer<typeof loreSearchDocumentSchema>;
export type LoreIngestionRunSchema = z.infer<typeof loreIngestionRunSchema>;
