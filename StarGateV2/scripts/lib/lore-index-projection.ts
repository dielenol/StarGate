import { createHash } from "node:crypto";

import {
  buildLoreEntityRef,
  loreAliasSchema,
  loreClaimSchema,
  loreEdgeSchema,
  loreSearchDocumentSchema,
  loreSourceDocumentSchema,
  normalizeLoreAlias,
} from "@stargate/shared-db/schemas";
import type {
  LoreAccess,
  LoreAlias,
  LoreAliasType,
  LoreClaim,
  LoreEdge,
  LoreEntityKind,
  LoreEntityRef,
  LoreRecordStatus,
  LoreSearchDocument,
  LoreSearchFacets,
  LoreSource,
  RoleLevel,
} from "@stargate/shared-db/types";
import {
  LORE_DOMAIN_SEARCH_PROJECTION_OWNER,
  ROLE_LEVEL_RANK,
  ROLE_LEVELS,
} from "@stargate/shared-db/types";
import type { Document } from "mongodb";

export interface LoreDomainSnapshot {
  characters: Document[];
  wikiPages: Document[];
  sessionReports: Document[];
  masterItems: Document[];
  factions: Document[];
  institutions: Document[];
}

export interface LoreProjectionBundle {
  sources: LoreSource[];
  aliases: LoreAlias[];
  edges: LoreEdge[];
  claims: LoreClaim[];
  searchDocuments: LoreSearchDocument[];
  warnings: string[];
}

interface AliasInput {
  value: unknown;
  type: LoreAliasType;
}

interface EntityCandidate {
  ref: LoreEntityRef;
  kind: LoreEntityKind;
  key: string;
  title: string;
  subtitle?: string;
  summary?: string;
  aliases: AliasInput[];
  searchText: string;
  facets: LoreSearchFacets;
  status: LoreRecordStatus;
  access: LoreAccess;
  sourceCollection: string;
  sourceKey: string;
  sourceTitle: string;
  sourceUpdatedAt: Date;
  sourceCreatedAt: Date;
  sourcePayload: unknown;
  raw: Document;
}

const MAX_SEARCH_TEXT = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((item) => item.length > 0)
    : [];
}

function asDate(value: unknown, fallback?: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value ?? ""));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return fallback ?? new Date(0);
}

function objectIdString(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toHexString" in value &&
    typeof value.toHexString === "function"
  ) {
    return String(value.toHexString());
  }
  return asString(value);
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  const objectId = objectIdString(value);
  if (objectId && typeof value === "object" && !Array.isArray(value)) {
    return objectId;
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

/** Storage-added predecessor lineage must survive an identical projection rerun. */
export function sameActiveAssertionPayload(
  existing: Document,
  desired: Document,
): boolean {
  const { _id: existingId, ...existingValue } = existing;
  const { _id: desiredId, ...desiredValue } = desired;
  void existingId;
  void desiredId;
  return stableJson(existingValue) === stableJson({
    ...desiredValue,
    lineage: existingValue.lineage,
  });
}

export function loreSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}:${loreSha256(value).slice(0, 48)}`;
}

function restrictedAccess(ownerId?: string): LoreAccess {
  return {
    visibility: "restricted",
    allowedRoles: ["V"],
    ...(ownerId ? { allowedUserIds: [ownerId] } : {}),
  };
}

function publicFlagAccess(
  value: unknown,
  options: { ownerId?: string } = {},
): LoreAccess {
  if (value === true) {
    return { visibility: "public" };
  }
  return restrictedAccess(options.ownerId);
}

function sessionReportAccess(value: unknown): LoreAccess {
  const minRole: RoleLevel =
    value === undefined || value === null
      ? "U"
      : typeof value === "string" &&
          (ROLE_LEVELS as readonly string[]).includes(value)
        ? (value as RoleLevel)
        : "GM";
  if (minRole === "U") return { visibility: "authenticated" };
  if (minRole === "GM") return { visibility: "gm-only" };
  return {
    visibility: "restricted",
    allowedRoles: ROLE_LEVELS.filter(
      (role) =>
        role !== "GM" && ROLE_LEVEL_RANK[role] >= ROLE_LEVEL_RANK[minRole],
    ),
  };
}

export function intersectLoreAccess(left: LoreAccess, right: LoreAccess): LoreAccess {
  if (left.visibility === "gm-only" || right.visibility === "gm-only") {
    return { visibility: "gm-only" };
  }
  if (left.visibility === "restricted" && right.visibility === "restricted") {
    const allowedRoles = (left.allowedRoles ?? []).filter((role) =>
      right.allowedRoles?.includes(role),
    );
    const allowedUserIds = (left.allowedUserIds ?? []).filter((userId) =>
      right.allowedUserIds?.includes(userId),
    );
    if (allowedRoles.length === 0 && allowedUserIds.length === 0) {
      return { visibility: "gm-only" };
    }
    return {
      visibility: "restricted",
      ...(allowedRoles.length > 0 ? { allowedRoles } : {}),
      ...(allowedUserIds.length > 0 ? { allowedUserIds } : {}),
    };
  }
  if (left.visibility === "restricted") return left;
  if (right.visibility === "restricted") return right;
  if (left.visibility === "authenticated" || right.visibility === "authenticated") {
    return { visibility: "authenticated" };
  }
  return { visibility: "public" };
}

/** master_items keeps the established legacy contract: only explicit false is private. */
function catalogAccess(
  value: unknown,
  options: { ownerId?: string } = {},
): LoreAccess {
  if (value !== false) return { visibility: "public" };
  return restrictedAccess(options.ownerId);
}

function canonicalRef(
  kind: LoreEntityKind,
  preferredKey: unknown,
  id: unknown,
): { ref: LoreEntityRef; key: string } {
  const preferred = asString(preferredKey);
  if (preferred) {
    const result = (() => {
      try {
        return buildLoreEntityRef(kind, preferred);
      } catch {
        return null;
      }
    })();
    if (result) return { ref: result, key: preferred };
  }
  const fallback = objectIdString(id);
  if (!fallback) throw new Error(`${kind} entity에 stable key와 _id가 없습니다.`);
  // Some established operational identities contain spaces or legacy glyphs
  // that cannot appear in a canonical graph ref. Use immutable _id for the ref,
  // but keep the real domain key for aliases, reverse-reference lookup and
  // source locators instead of silently replacing it with the fallback.
  return {
    ref: buildLoreEntityRef(kind, fallback),
    key: preferred || fallback,
  };
}

function truncate(value: string, max = MAX_SEARCH_TEXT): string {
  return value.length <= max ? value : value.slice(0, max);
}

function uniqueStrings(values: unknown[]): string[] {
  return [
    ...new Set(values.map(asString).filter((value) => value.length > 0)),
  ];
}

function optionalFacets(facets: LoreSearchFacets): LoreSearchFacets {
  return Object.fromEntries(
    Object.entries(facets).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (isRecord(value)) return Object.keys(value).length > 0;
      return value !== undefined;
    }),
  ) as LoreSearchFacets;
}

function loreObject(doc: Document): Record<string, unknown> {
  return isRecord(doc.lore) ? doc.lore : {};
}

function workshopOwner(doc: Document): string | undefined {
  if (!isRecord(doc.workshop)) return undefined;
  const ownerId = asString(doc.workshop.ownerId);
  return ownerId || undefined;
}

/** Runtime concurrency metadata is not lore content and must not churn provenance IDs. */
function loreSourcePayload(doc: Document): Document {
  const {
    __sessionReportReferenceVersion: _legacyReferenceVersion,
    __sessionReportReferenceLockAt: _referenceLockAt,
    provenanceSourceId: _legacyProvenanceSourceId,
    provenanceSourceIds: _provenanceSourceIds,
    ...payload
  } = doc;
  void _legacyReferenceVersion;
  void _referenceLockAt;
  void _legacyProvenanceSourceId;
  void _provenanceSourceIds;
  return payload;
}

function buildEntities(snapshot: LoreDomainSnapshot): EntityCandidate[] {
  const entities: EntityCandidate[] = [];

  for (const doc of snapshot.characters) {
    const lore = loreObject(doc);
    const { ref, key } = canonicalRef("character", doc.codename, doc._id);
    const name = asString(lore.name);
    const codename = asString(doc.codename) || key;
    const background = asString(lore.background);
    const role = asString(doc.role);
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "character",
      key,
      title: name || codename,
      subtitle: name && name !== codename ? codename : role || undefined,
      summary: background || role || undefined,
      aliases: [
        { value: codename, type: "codename" },
        { value: name, type: "canonical-name" },
        { value: lore.nameEn, type: "translation" },
        { value: lore.nameNative, type: "translation" },
        { value: lore.nickname, type: "nickname" },
      ],
      searchText: truncate(
        uniqueStrings([
          codename,
          name,
          lore.nameEn,
          lore.nameNative,
          lore.nickname,
          role,
          lore.gender,
          lore.age,
          lore.appearance,
          lore.personality,
          background,
          lore.quote,
          lore.roleDetail,
          lore.notes,
          ...asStringArray(lore.loreTags),
          ...asStringArray(lore.appearsInEvents),
          doc.loreMd,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: [asString(doc.type) || "CHARACTER"],
        tags: asStringArray(lore.loreTags),
        factionCodes: uniqueStrings([doc.factionCode]),
        institutionCodes: uniqueStrings([doc.institutionCode]),
        sessionIds: asStringArray(lore.appearsInEvents),
      }),
      status: "canon-from-source",
      // Dossier는 isPublic과 별개로 이름/성격/관계에 field-level clearance가
      // 적용된다. 보조 projection은 tiered redaction을 표현하지 못하므로 V/owner/GM
      // 전용으로 fail-closed하고, 일반 사용자 검색은 canonical personnel fallback을 쓴다.
      access: restrictedAccess(asString(doc.ownerId) || undefined),
      sourceCollection: "characters",
      sourceKey: codename,
      sourceTitle: `신원조회 ${name || codename}`,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: loreSourcePayload(doc),
      raw: doc,
    });
  }

  for (const doc of snapshot.wikiPages) {
    const { ref, key } = canonicalRef("wiki", doc.slug, doc._id);
    const title = asString(doc.title) || key;
    const content = asString(doc.content);
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "wiki",
      key,
      title,
      summary: asString(doc.summary) || content || undefined,
      aliases: [
        { value: title, type: "canonical-name" },
        { value: doc.slug, type: "legacy-id" },
        ...asStringArray(doc.tags).map((value) => ({
          value,
          type: "search-keyword" as const,
        })),
      ],
      searchText: truncate(
        uniqueStrings([
          title,
          doc.slug,
          doc.category,
          ...asStringArray(doc.tags),
          content,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: uniqueStrings([doc.category]),
        tags: asStringArray(doc.tags),
      }),
      status: "canon-from-source",
      access: publicFlagAccess(doc.isPublic),
      sourceCollection: "wiki_pages",
      sourceKey: asString(doc.slug) || key,
      sourceTitle: `위키 ${title}`,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: loreSourcePayload(doc),
      raw: doc,
    });
  }

  for (const doc of snapshot.sessionReports) {
    const { ref, key } = canonicalRef("report", doc.sessionId, doc._id);
    const title = asString(doc.sessionTitle) || key;
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "report",
      key,
      title,
      subtitle: asString(doc.reportNumber) || undefined,
      summary: asString(doc.summary) || undefined,
      aliases: [
        { value: title, type: "canonical-name" },
        { value: doc.sessionId, type: "legacy-id" },
        { value: doc.reportNumber, type: "title" },
      ],
      searchText: truncate(
        uniqueStrings([
          title,
          doc.sessionId,
          doc.reportNumber,
          doc.summary,
          ...asStringArray(doc.highlights),
          ...asStringArray(doc.participants),
          doc.locationLabel,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: ["작전 보고서"],
        sessionIds: [key],
      }),
      status: "session-confirmed",
      access: sessionReportAccess(doc.minRole),
      sourceCollection: "session_reports",
      sourceKey: key,
      sourceTitle: title,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: loreSourcePayload(doc),
      raw: doc,
    });
  }

  for (const doc of snapshot.masterItems) {
    const { ref, key } = canonicalRef("catalog", doc.slug, doc._id);
    const title = asString(doc.name) || key;
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "catalog",
      key,
      title,
      subtitle: asString(doc.nameEn) || undefined,
      summary: asString(doc.description) || undefined,
      aliases: [
        { value: title, type: "canonical-name" },
        { value: doc.nameEn, type: "translation" },
        { value: doc.slug, type: "legacy-id" },
        { value: doc.code, type: "legacy-id" },
        ...asStringArray(doc.tags).map((value) => ({
          value,
          type: "search-keyword" as const,
        })),
      ],
      searchText: truncate(
        uniqueStrings([
          title,
          doc.nameEn,
          doc.slug,
          doc.code,
          doc.category,
          doc.description,
          doc.effect,
          doc.damage,
          ...asStringArray(doc.tags),
          doc.loreMd,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: uniqueStrings([doc.category]),
        tags: asStringArray(doc.tags),
        itemCategories: uniqueStrings([doc.category]),
      }),
      status: "canon-from-source",
      access: catalogAccess(doc.isPublic, { ownerId: workshopOwner(doc) }),
      sourceCollection: "master_items",
      sourceKey: asString(doc.slug) || key,
      sourceTitle: `카탈로그 ${title}`,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: loreSourcePayload(doc),
      raw: doc,
    });
  }

  for (const doc of snapshot.factions) {
    const { ref, key } = canonicalRef("faction", doc.code, doc._id);
    const title = asString(doc.label) || key;
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "faction",
      key,
      title,
      subtitle: asString(doc.labelEn) || key,
      summary: asString(doc.summary) || undefined,
      aliases: [
        { value: title, type: "canonical-name" },
        { value: doc.labelEn, type: "translation" },
        { value: doc.code, type: "legacy-id" },
        { value: doc.slug, type: "legacy-id" },
        ...asStringArray(doc.tags).map((value) => ({
          value,
          type: "search-keyword" as const,
        })),
      ],
      searchText: truncate(
        uniqueStrings([
          title,
          doc.labelEn,
          doc.code,
          doc.slug,
          doc.summary,
          doc.ideology,
          ...asStringArray(doc.tags),
          doc.loreMd,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: ["세력"],
        tags: asStringArray(doc.tags),
        factionCodes: [key],
      }),
      status: "canon-from-source",
      access: publicFlagAccess(doc.isPublic),
      sourceCollection: "factions",
      sourceKey: key,
      sourceTitle: `세력 ${title}`,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: doc,
      raw: doc,
    });
  }

  for (const doc of snapshot.institutions) {
    const { ref, key } = canonicalRef("institution", doc.code, doc._id);
    const title = asString(doc.label) || key;
    const updatedAt = asDate(doc.updatedAt, asDate(doc.createdAt));
    entities.push({
      ref,
      kind: "institution",
      key,
      title,
      subtitle: asString(doc.labelEn) || key,
      summary: asString(doc.summary) || undefined,
      aliases: [
        { value: title, type: "canonical-name" },
        { value: doc.labelEn, type: "translation" },
        { value: doc.code, type: "legacy-id" },
        { value: doc.slug, type: "legacy-id" },
        ...asStringArray(doc.tags).map((value) => ({
          value,
          type: "search-keyword" as const,
        })),
      ],
      searchText: truncate(
        uniqueStrings([
          title,
          doc.labelEn,
          doc.code,
          doc.slug,
          doc.summary,
          doc.mission,
          doc.headquartersLocation,
          ...asStringArray(doc.tags),
          ...((Array.isArray(doc.subUnits) ? doc.subUnits : [])
            .filter(isRecord)
            .flatMap((unit) => [unit.code, unit.label, unit.labelEn, unit.summary])),
          doc.loreMd,
        ]).join("\n"),
      ),
      facets: optionalFacets({
        categories: ["기관"],
        tags: asStringArray(doc.tags),
        factionCodes: uniqueStrings([doc.parentFactionCode]),
        institutionCodes: [key],
      }),
      status: "canon-from-source",
      access: publicFlagAccess(doc.isPublic),
      sourceCollection: "institutions",
      sourceKey: key,
      sourceTitle: `기관 ${title}`,
      sourceUpdatedAt: updatedAt,
      sourceCreatedAt: asDate(doc.createdAt, updatedAt),
      sourcePayload: doc,
      raw: doc,
    });
  }

  return entities;
}

function sourceFor(entity: EntityCandidate): LoreSource {
  const contentHash = loreSha256(stableJson(entity.sourcePayload));
  const sourceId = stableId(
    "idx-source",
    `${entity.sourceCollection}:${entity.sourceKey}:${contentHash}`,
  );
  const sourceAccess: LoreAccess =
    entity.access.visibility === "public"
      ? { visibility: "authenticated" }
      : entity.access;
  return loreSourceDocumentSchema.parse({
    sourceId,
    kind: "database-record",
    title: entity.sourceTitle,
    locator: {
      kind: "database",
      value: `${entity.sourceCollection}/${entity.sourceKey}`,
    },
    contentHash,
    ...(entity.kind === "report" ? { sessionId: entity.key } : {}),
    ...(entity.kind === "report" &&
    Array.isArray(entity.raw.provenanceSourceIds) &&
    entity.raw.provenanceSourceIds.length > 0
      ? {
          parentSourceIds: uniqueStrings(entity.raw.provenanceSourceIds).sort(),
        }
      : {}),
    access: sourceAccess,
    capturedAt: entity.sourceUpdatedAt,
    createdAt: entity.sourceCreatedAt,
    updatedAt: entity.sourceUpdatedAt,
  }) as LoreSource;
}

function evidence(source: LoreSource) {
  return [{ sourceId: source.sourceId }];
}

function activeLineage() {
  return { state: "active" as const };
}

export const DOMAIN_SEARCH_PROJECTION_OWNER = LORE_DOMAIN_SEARCH_PROJECTION_OWNER;

function aliasesFor(
  entity: EntityCandidate,
  source: LoreSource,
): LoreAlias[] {
  const deduped = new Map<string, AliasInput>();
  for (const candidate of entity.aliases) {
    const alias = asString(candidate.value);
    if (!alias) continue;
    const normalizedAlias = normalizeLoreAlias(alias);
    const logical = `${candidate.type}:${normalizedAlias}`;
    if (!deduped.has(logical)) deduped.set(logical, { ...candidate, value: alias });
  }
  return [...deduped.values()].map((candidate) => {
    const alias = asString(candidate.value);
    const normalizedAlias = normalizeLoreAlias(alias);
    return loreAliasSchema.parse({
      aliasId: stableId(
        "idx-alias",
        `${entity.ref}:${candidate.type}:${normalizedAlias}:${source.sourceId}`,
      ),
      entityRef: entity.ref,
      alias,
      normalizedAlias,
      aliasType: candidate.type,
      logicalKey: `${entity.ref}|${candidate.type}|${normalizedAlias}`,
      language: /[가-힣]/u.test(alias) ? "ko" : "und",
      status: entity.status,
      confidence: 1,
      evidence: evidence(source),
      lineage: activeLineage(),
      access: entity.access,
      createdAt: entity.sourceCreatedAt,
      updatedAt: entity.sourceUpdatedAt,
    }) as LoreAlias;
  });
}

function edgeFor(
  from: EntityCandidate,
  relation: string,
  to: EntityCandidate,
  source: LoreSource,
  confidence = 1,
): LoreEdge {
  return loreEdgeSchema.parse({
    edgeId: stableId(
      "idx-edge",
      `${from.ref}:${relation}:${to.ref}:${source.sourceId}`,
    ),
    fromRef: from.ref,
    relation,
    toRef: to.ref,
    logicalKey: `${from.ref}|${relation}|${to.ref}`,
    status: from.status,
    confidence,
    evidence: evidence(source),
    lineage: activeLineage(),
    access: intersectLoreAccess(from.access, to.access),
    createdAt: from.sourceCreatedAt,
    updatedAt: from.sourceUpdatedAt,
  }) as LoreEdge;
}

function claimFor(
  entity: EntityCandidate,
  predicate: string,
  value: unknown,
  source: LoreSource,
): LoreClaim | null {
  if (value === undefined || value === "") return null;
  return loreClaimSchema.parse({
    claimId: stableId(
      "idx-claim",
      `${entity.ref}:${predicate}:${stableJson(value)}:${source.sourceId}`,
    ),
    subjectRef: entity.ref,
    predicate,
    logicalKey: `${entity.ref}|${predicate}`,
    value,
    status: entity.status,
    confidence: 1,
    evidence: evidence(source),
    lineage: activeLineage(),
    access: entity.access,
    createdAt: entity.sourceCreatedAt,
    updatedAt: entity.sourceUpdatedAt,
  }) as LoreClaim;
}

function searchDocumentFor(
  entity: EntityCandidate,
  source: LoreSource,
  aliases: LoreAlias[],
): LoreSearchDocument {
  return loreSearchDocumentSchema.parse({
    entityRef: entity.ref,
    entityKind: entity.kind,
    title: entity.title,
    ...(entity.subtitle ? { subtitle: entity.subtitle } : {}),
    ...(entity.summary
      ? { summary: truncate(entity.summary, 2_000) }
      : {}),
    aliases: uniqueStrings(aliases.map((alias) => alias.alias)),
    searchText: entity.searchText || entity.title,
    facets: entity.facets,
    status: entity.status,
    sourceIds: [source.sourceId],
    access: entity.access,
    contentHash: loreSha256(
      stableJson({
        title: entity.title,
        subtitle: entity.subtitle,
        summary: entity.summary,
        aliases: aliases.map((alias) => alias.alias),
        searchText: entity.searchText,
        facets: entity.facets,
        status: entity.status,
        access: entity.access,
      }),
    ),
    projectionVersion: 1,
    projectionOwner: DOMAIN_SEARCH_PROJECTION_OWNER,
    sourceUpdatedAt: entity.sourceUpdatedAt,
    createdAt: entity.sourceCreatedAt,
    updatedAt: entity.sourceUpdatedAt,
  }) as LoreSearchDocument;
}

function pushEdge(
  edges: Map<string, LoreEdge>,
  candidate: LoreEdge | null,
): void {
  if (!candidate) return;
  const logical = `${candidate.fromRef}|${candidate.relation}|${candidate.toRef}`;
  if (!edges.has(logical)) edges.set(logical, candidate);
}

function buildEntityIndexes(entities: EntityCandidate[]) {
  const byRef = new Map(entities.map((entity) => [entity.ref, entity]));
  const byKindKey = new Map(
    entities.map((entity) => [`${entity.kind}:${entity.key}`, entity]),
  );
  const characterByCodename = new Map<string, EntityCandidate>();
  const explicitTargets = new Map<string, EntityCandidate[]>();
  const qualifiedExplicitTargets = new Map<string, EntityCandidate[]>();
  const addTarget = (
    targets: Map<string, EntityCandidate[]>,
    value: unknown,
    entity: EntityCandidate,
    kind?: LoreEntityKind,
  ) => {
    const normalized = normalizeLoreAlias(asString(value));
    if (!normalized) return;
    const key = kind ? `${kind}:${normalized}` : normalized;
    const current = targets.get(key) ?? [];
    if (!current.some((candidate) => candidate.ref === entity.ref)) {
      current.push(entity);
      targets.set(key, current);
    }
  };
  for (const entity of entities) {
    if (entity.kind === "character") {
      characterByCodename.set(entity.key.toLocaleUpperCase("en-US"), entity);
    }
    if (!["character", "wiki", "report", "catalog"].includes(entity.kind)) {
      continue;
    }
    for (const value of [entity.key, entity.title, entity.subtitle]) {
      addTarget(explicitTargets, value, entity);
      addTarget(qualifiedExplicitTargets, value, entity, entity.kind);
    }
    for (const alias of entity.aliases) {
      // Search tags improve recall but are not explicit-link identities. Treating
      // them as identities creates false/ambiguous graph edges that the wiki
      // renderer itself would never create.
      if (alias.type === "search-keyword") continue;
      addTarget(explicitTargets, alias.value, entity);
      addTarget(
        qualifiedExplicitTargets,
        alias.value,
        entity,
        entity.kind,
      );
    }
  }
  return {
    byRef,
    byKindKey,
    characterByCodename,
    explicitTargets,
    qualifiedExplicitTargets,
  };
}

function targetByCode(
  indexes: ReturnType<typeof buildEntityIndexes>,
  code: unknown,
): EntityCandidate | undefined {
  const key = asString(code);
  return (
    indexes.byKindKey.get(`faction:${key}`) ??
    indexes.byKindKey.get(`institution:${key}`)
  );
}

function reportTarget(
  indexes: ReturnType<typeof buildEntityIndexes>,
  sessionId: unknown,
): EntityCandidate | undefined {
  return indexes.byKindKey.get(`report:${asString(sessionId)}`);
}

function characterTarget(
  indexes: ReturnType<typeof buildEntityIndexes>,
  codename: unknown,
): EntityCandidate | undefined {
  return indexes.characterByCodename.get(
    asString(codename).toLocaleUpperCase("en-US"),
  );
}

interface ExplicitWikiTarget {
  raw: string;
  key: string;
  kind?: "character" | "wiki" | "report" | "catalog";
}

const EXPLICIT_LINK_KIND = new Map<
  string,
  NonNullable<ExplicitWikiTarget["kind"]>
>([
  ["wiki", "wiki"],
  ["위키", "wiki"],
  ["report", "report"],
  ["operation", "report"],
  ["작전보고서", "report"],
  ["보고서", "report"],
  ["personnel", "character"],
  ["dossier", "character"],
  ["신원조회", "character"],
  ["인물", "character"],
  ["catalog", "catalog"],
  ["item", "catalog"],
  ["카탈로그", "catalog"],
]);

const EXPLICIT_LINK_PRIORITY: Record<
  NonNullable<ExplicitWikiTarget["kind"]>,
  number
> = {
  report: 90,
  character: 80,
  wiki: 70,
  catalog: 60,
};

function explicitWikiTargets(content: string): ExplicitWikiTarget[] {
  return [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .map((raw) => {
      const separator = raw.indexOf(":");
      if (separator <= 0) return { raw, key: raw };
      const prefix = normalizeLoreAlias(raw.slice(0, separator));
      const kind = EXPLICIT_LINK_KIND.get(prefix);
      if (!kind) return { raw, key: raw };
      return { raw, kind, key: raw.slice(separator + 1).trim() };
    });
}

function resolveExplicitWikiTarget(
  indexes: ReturnType<typeof buildEntityIndexes>,
  target: ExplicitWikiTarget,
): EntityCandidate[] {
  const normalized = normalizeLoreAlias(target.key);
  if (!normalized) return [];
  if (target.kind) {
    return (
      indexes.qualifiedExplicitTargets.get(`${target.kind}:${normalized}`) ?? []
    );
  }

  const candidates = indexes.explicitTargets.get(normalized) ?? [];
  if (candidates.length <= 1) return candidates;

  // Match the actual wiki renderer's explicit-link precedence. Ambiguity is
  // retained only when two records of the same highest-priority kind collide.
  const highestPriority = Math.max(
    ...candidates.map(
      (candidate) =>
        EXPLICIT_LINK_PRIORITY[
          candidate.kind as NonNullable<ExplicitWikiTarget["kind"]>
        ],
    ),
  );
  return candidates.filter(
    (candidate) =>
      EXPLICIT_LINK_PRIORITY[
        candidate.kind as NonNullable<ExplicitWikiTarget["kind"]>
      ] === highestPriority,
  );
}

function relationshipType(value: unknown): string {
  const type = asString(value).toLocaleLowerCase("en-US");
  const supported = new Set([
    "ally",
    "rival",
    "neutral",
    "subordinate",
    "parent",
    "sibling",
  ]);
  return supported.has(type) ? `organization-${type}` : "related-to";
}

function deriveEdges(
  entities: EntityCandidate[],
  sourceByRef: Map<LoreEntityRef, LoreSource>,
  warnings: string[],
): LoreEdge[] {
  const indexes = buildEntityIndexes(entities);
  const edges = new Map<string, LoreEdge>();

  for (const entity of entities) {
    const source = sourceByRef.get(entity.ref);
    if (!source) continue;
    const raw = entity.raw;

    if (entity.kind === "character") {
      const faction = indexes.byKindKey.get(
        `faction:${asString(raw.factionCode)}`,
      );
      const institution = indexes.byKindKey.get(
        `institution:${asString(raw.institutionCode)}`,
      );
      if (faction) pushEdge(edges, edgeFor(entity, "member-of", faction, source));
      else if (asString(raw.factionCode)) {
        warnings.push(
          `unresolved character faction: ${entity.key} -> ${asString(raw.factionCode)}`,
        );
      }
      if (institution) {
        pushEdge(edges, edgeFor(entity, "member-of", institution, source));
      } else if (asString(raw.institutionCode)) {
        warnings.push(
          `unresolved character institution: ${entity.key} -> ${asString(raw.institutionCode)}`,
        );
      }
      const lore = loreObject(raw);
      for (const relation of Array.isArray(lore.relations)
        ? lore.relations.filter(isRecord)
        : []) {
        const target = characterTarget(indexes, relation.targetCodename);
        if (target) {
          pushEdge(
            edges,
            edgeFor(entity, "related-to", target, source, 0.9),
          );
        } else if (asString(relation.targetCodename)) {
          warnings.push(
            `unresolved character relation: ${entity.key} -> ${asString(relation.targetCodename)}`,
          );
        }
      }
      const sessionIds = uniqueStrings([
        ...asStringArray(lore.appearsInEvents),
        ...(Array.isArray(lore.sessionAppearances)
          ? lore.sessionAppearances
              .filter(isRecord)
              .map((appearance) => appearance.sessionId)
          : []),
      ]);
      for (const sessionId of sessionIds) {
        const report = reportTarget(indexes, sessionId);
        if (report) {
          pushEdge(edges, edgeFor(entity, "appeared-in", report, source));
        } else {
          warnings.push(
            `unresolved character session: ${entity.key} -> ${sessionId}`,
          );
        }
      }
    }

    if (entity.kind === "faction" || entity.kind === "institution") {
      if (entity.kind === "institution") {
        const parent = indexes.byKindKey.get(
          `faction:${asString(raw.parentFactionCode)}`,
        );
        if (parent) {
          pushEdge(edges, edgeFor(entity, "subordinate-to", parent, source));
        } else if (asString(raw.parentFactionCode)) {
          warnings.push(
            `unresolved institution parent: ${entity.key} -> ${asString(raw.parentFactionCode)}`,
          );
        }
      }
      for (const relation of Array.isArray(raw.relationships)
        ? raw.relationships.filter(isRecord)
        : []) {
        const target = targetByCode(indexes, relation.targetCode);
        if (target) {
          pushEdge(
            edges,
            edgeFor(
              entity,
              relationshipType(relation.type),
              target,
              source,
            ),
          );
        } else if (asString(relation.targetCode)) {
          warnings.push(
            `unresolved organization relation: ${entity.key} -> ${asString(relation.targetCode)}`,
          );
        }
      }
    }

    if (entity.kind === "report") {
      const explicitPersonnel = new Set(
        asStringArray(raw.relatedPersonnelCodenames),
      );
      for (const codename of uniqueStrings([
        ...asStringArray(raw.participants),
        ...explicitPersonnel,
      ])) {
        const target = characterTarget(indexes, codename);
        if (target) pushEdge(edges, edgeFor(entity, "mentions", target, source));
        else if (explicitPersonnel.has(codename)) {
          warnings.push(
            `unresolved report personnel: ${entity.key} -> ${codename}`,
          );
        }
      }
      for (const slug of asStringArray(raw.relatedWikiSlugs)) {
        const target = indexes.byKindKey.get(`wiki:${slug}`);
        if (target) pushEdge(edges, edgeFor(entity, "references", target, source));
        else warnings.push(`unresolved report wiki: ${entity.key} -> ${slug}`);
      }
      for (const slug of asStringArray(raw.relatedCatalogSlugs)) {
        const target = indexes.byKindKey.get(`catalog:${slug}`);
        if (target) pushEdge(edges, edgeFor(entity, "references", target, source));
        else warnings.push(`unresolved report catalog: ${entity.key} -> ${slug}`);
      }
    }

    if (entity.kind === "wiki") {
      for (const target of explicitWikiTargets(asString(raw.content))) {
        const candidates = resolveExplicitWikiTarget(indexes, target);
        if (candidates.length === 1) {
          pushEdge(
            edges,
            edgeFor(entity, "references", candidates[0], source),
          );
        } else if (candidates.length === 0) {
          warnings.push(`unresolved wiki link: ${entity.key} -> ${target.raw}`);
        } else {
          warnings.push(`ambiguous wiki link: ${entity.key} -> ${target.raw}`);
        }
      }
    }
  }

  return [...edges.values()];
}

function deriveClaims(
  entities: EntityCandidate[],
  sourceByRef: Map<LoreEntityRef, LoreSource>,
): LoreClaim[] {
  const claims: LoreClaim[] = [];
  const add = (claim: LoreClaim | null) => {
    if (claim) claims.push(claim);
  };
  for (const entity of entities) {
    const source = sourceByRef.get(entity.ref);
    if (!source) continue;
    const raw = entity.raw;
    if (entity.kind === "character") {
      add(claimFor(entity, "identity.type", raw.type, source));
      add(claimFor(entity, "identity.role", raw.role, source));
    } else if (entity.kind === "faction") {
      add(claimFor(entity, "organization.scope", raw.scope, source));
    } else if (entity.kind === "institution") {
      add(claimFor(entity, "organization.mission", raw.mission, source));
    } else if (entity.kind === "wiki") {
      add(claimFor(entity, "wiki.category", raw.category, source));
    } else if (entity.kind === "report") {
      add(claimFor(entity, "report.location-label", raw.locationLabel, source));
      add(claimFor(entity, "report.map-precision", raw.mapPrecision, source));
    } else if (entity.kind === "catalog") {
      add(claimFor(entity, "catalog.category", raw.category, source));
      if (typeof raw.isAvailable === "boolean") {
        add(claimFor(entity, "catalog.is-available", raw.isAvailable, source));
      }
    }
  }
  return claims;
}

function assertUnique<T>(
  values: T[],
  key: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) throw new Error(`${label} 중복: ${id}`);
    seen.add(id);
  }
}

export function buildLoreProjection(
  snapshot: LoreDomainSnapshot,
): LoreProjectionBundle {
  const warnings: string[] = [];
  const entities = buildEntities(snapshot);
  assertUnique(entities, (entity) => entity.ref, "entityRef");
  assertUnique(
    entities,
    (entity) => `${entity.kind}:${entity.key}`,
    "domain stable identity",
  );

  const sources = entities.map(sourceFor);
  const sourceByRef = new Map(
    entities.map((entity, index) => [entity.ref, sources[index]]),
  );
  const aliases = entities.flatMap((entity) =>
    aliasesFor(entity, sourceByRef.get(entity.ref)!),
  );
  const edges = deriveEdges(entities, sourceByRef, warnings);
  const claims = deriveClaims(entities, sourceByRef);
  const aliasesByRef = new Map<LoreEntityRef, LoreAlias[]>();
  for (const alias of aliases) {
    const current = aliasesByRef.get(alias.entityRef) ?? [];
    current.push(alias);
    aliasesByRef.set(alias.entityRef, current);
  }
  const searchDocuments = entities.map((entity) =>
    searchDocumentFor(
      entity,
      sourceByRef.get(entity.ref)!,
      aliasesByRef.get(entity.ref) ?? [],
    ),
  );

  assertUnique(sources, (source) => source.sourceId, "sourceId");
  assertUnique(aliases, (alias) => alias.aliasId, "aliasId");
  assertUnique(edges, (edge) => edge.edgeId, "edgeId");
  assertUnique(claims, (claim) => claim.claimId, "claimId");
  assertUnique(searchDocuments, (doc) => doc.entityRef, "search entityRef");

  return {
    sources,
    aliases,
    edges,
    claims,
    searchDocuments,
    warnings: [...new Set(warnings)].sort(),
  };
}

export function loreAliasLogicalKey(alias: LoreAlias): string {
  return `${alias.entityRef}|${alias.aliasType}|${alias.normalizedAlias}`;
}

export function loreEdgeLogicalKey(edge: LoreEdge): string {
  return `${edge.fromRef}|${edge.relation}|${edge.toRef}`;
}

export function loreClaimLogicalKey(claim: LoreClaim): string {
  return `${claim.subjectRef}|${claim.predicate}`;
}
