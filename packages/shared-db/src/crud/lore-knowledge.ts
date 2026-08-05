import {
  MongoServerError,
  type ClientSession,
  type Collection,
  type Document,
  type Filter,
  type Sort,
  type WithId,
} from "mongodb";

import {
  loreAliasesCol,
  loreClaimsCol,
  loreEdgesCol,
  loreIngestionRunsCol,
  loreSearchDocumentsCol,
  loreSourcesCol,
} from "../collections.js";
import { getClient } from "../client.js";
import {
  loreAliasSchema,
  loreClaimSchema,
  loreEdgeSchema,
  loreIngestionRunSchema,
  loreIngestionStatusSchema,
  loreEntityRefSchema,
  loreSearchQuerySchema,
  loreSearchDocumentSchema,
  loreSourceDocumentSchema,
  loreStableIdSchema,
  normalizeLoreAlias,
  buildLoreAliasLogicalKey,
  buildLoreEdgeLogicalKey,
  buildLoreClaimLogicalKey,
} from "../schemas/lore-knowledge.schema.js";
import { ROLE_LEVELS, type RoleLevel } from "../types/character.js";
import type {
  LoreAccess,
  LoreAlias,
  LoreClaim,
  LoreEdge,
  LoreEntityKind,
  LoreEntityRef,
  LoreIngestionError,
  LoreIngestionRun,
  LoreIngestionStats,
  LoreIngestionStatus,
  LoreRecordStatus,
  LoreSearchDocument,
  LoreSource,
} from "../types/lore-knowledge.js";

export type CreateLoreSourceInput = Omit<
  LoreSource,
  "_id" | "createdAt" | "updatedAt"
>;
export type CreateLoreAliasInput = Omit<
  LoreAlias,
  "_id" | "logicalKey" | "createdAt" | "updatedAt"
>;
export type CreateLoreEdgeInput = Omit<
  LoreEdge,
  "_id" | "logicalKey" | "createdAt" | "updatedAt"
>;
export type CreateLoreClaimInput = Omit<
  LoreClaim,
  "_id" | "logicalKey" | "createdAt" | "updatedAt"
>;
export type PutLoreSearchDocumentInput = Omit<
  LoreSearchDocument,
  "_id" | "createdAt" | "updatedAt"
>;
export type CreateLoreIngestionRunInput = Omit<
  LoreIngestionRun,
  "_id" | "createdAt" | "updatedAt"
>;

export interface LoreAccessContext {
  isAuthenticated: boolean;
  role?: RoleLevel;
  userId?: string;
}

type AccessControlled = { access: LoreAccess };

function normalizeLimit(limit: number, defaultValue: number, max: number): number {
  if (!Number.isInteger(limit) || limit < 1) return defaultValue;
  return Math.min(limit, max);
}

/**
 * Shared authorization filter for every lore auxiliary collection.
 * GM intentionally bypasses the visibility filter; all other users receive
 * the narrowest matching public/authenticated/restricted subset.
 */
export function buildLoreAccessFilter<T extends AccessControlled>(
  context: LoreAccessContext,
): Filter<T> {
  const isAuthenticated = context.isAuthenticated === true;
  const role = ROLE_LEVELS.includes(context.role as RoleLevel)
    ? context.role
    : undefined;
  const userId =
    typeof context.userId === "string" && context.userId.trim()
      ? context.userId.trim()
      : undefined;

  if (isAuthenticated && role === "GM") return {};

  const clauses: Record<string, unknown>[] = [
    { "access.visibility": "public" },
  ];

  if (isAuthenticated) {
    clauses.push({ "access.visibility": "authenticated" });
  }

  const restrictedAllowlist: Record<string, unknown>[] = [];
  if (role) {
    restrictedAllowlist.push({ "access.allowedRoles": role });
  }
  if (userId) {
    restrictedAllowlist.push({ "access.allowedUserIds": userId });
  }
  if (isAuthenticated && restrictedAllowlist.length > 0) {
    clauses.push({
      "access.visibility": "restricted",
      $or: restrictedAllowlist,
    });
  }

  return { $or: clauses } as Filter<T>;
}

function combineAccessFilter<T extends AccessControlled>(
  context: LoreAccessContext,
  domainFilter: Filter<T>,
): Filter<T> {
  const accessFilter = buildLoreAccessFilter<T>(context);
  if (Object.keys(domainFilter).length === 0) return accessFilter;
  if (Object.keys(accessFilter).length === 0) return domainFilter;
  return { $and: [accessFilter, domainFilter] } as Filter<T>;
}

/**
 * Auxiliary projection reads are enabled only when the newest rebuild reached
 * succeeded. A running/partial/failed generation may have committed a subset,
 * so callers must degrade to domain SSOT instead of exposing mixed generations.
 */
export async function isLoreProjectionGenerationReady(): Promise<boolean> {
  const col = await loreIngestionRunsCol();
  const latest = await col.findOne(
    { mode: "search-rebuild", dryRun: false },
    { sort: { startedAt: -1, createdAt: -1, _id: -1 } },
  );
  return latest?.status === "succeeded";
}

/* ── Immutable provenance and assertions ── */

export async function createLoreSource(
  input: CreateLoreSourceInput,
): Promise<WithId<LoreSource>> {
  const now = new Date();
  const doc = loreSourceDocumentSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  }) as LoreSource;
  const col = await loreSourcesCol();
  const client = await getClient();
  const session = client.startSession();
  try {
    let created: WithId<LoreSource> | null = null;
    await session.withTransaction(async () => {
      created = null;
      if (doc.parentSourceId) {
        await assertLoreSourcesExist([doc.parentSourceId], session);
      }
      const result = await col.insertOne(doc, { session });
      created = { ...doc, _id: result.insertedId } as WithId<LoreSource>;
    });
    if (!created) throw new Error(`lore source transaction 결과 없음: ${doc.sourceId}`);
    return created;
  } finally {
    await session.endSession();
  }
}

async function assertLoreSourcesExist(
  sourceIds: string[],
  session: ClientSession,
): Promise<void> {
  const uniqueSourceIds = [...new Set(sourceIds)];
  const col = await loreSourcesCol();
  const count = await col.countDocuments(
    { sourceId: { $in: uniqueSourceIds } },
    { session },
  );
  if (count !== uniqueSourceIds.length) {
    throw new Error("lore evidence source 참조 무결성 위반");
  }
}

export async function createLoreAlias(
  input: CreateLoreAliasInput,
): Promise<WithId<LoreAlias>> {
  const now = new Date();
  const doc = loreAliasSchema.parse({
    ...input,
    logicalKey: buildLoreAliasLogicalKey(input),
    createdAt: now,
    updatedAt: now,
  }) as LoreAlias;
  const col = await loreAliasesCol();
  return insertActiveAssertion(col, doc, "aliasId");
}

export async function createLoreEdge(
  input: CreateLoreEdgeInput,
): Promise<WithId<LoreEdge>> {
  const now = new Date();
  const doc = loreEdgeSchema.parse({
    ...input,
    logicalKey: buildLoreEdgeLogicalKey(input),
    createdAt: now,
    updatedAt: now,
  }) as LoreEdge;
  const col = await loreEdgesCol();
  return insertActiveAssertion(col, doc, "edgeId");
}

export async function createLoreClaim(
  input: CreateLoreClaimInput,
): Promise<WithId<LoreClaim>> {
  const now = new Date();
  const doc = loreClaimSchema.parse({
    ...input,
    logicalKey: buildLoreClaimLogicalKey(input),
    createdAt: now,
    updatedAt: now,
  }) as LoreClaim;
  const col = await loreClaimsCol();
  return insertActiveAssertion(col, doc, "claimId");
}

async function insertActiveAssertion<T extends LoreAlias | LoreEdge | LoreClaim>(
  col: Collection<T>,
  doc: T,
  idField: "aliasId" | "edgeId" | "claimId",
): Promise<WithId<T>> {
  if (doc.lineage.state !== "active") {
    throw new Error("새 lore assertion은 active lineage로만 생성할 수 있습니다.");
  }
  const predecessorIds = doc.lineage.supersedesIds ?? [];
  const client = await getClient();
  const session = client.startSession();
  try {
    let inserted: WithId<T> | null = null;
    await session.withTransaction(async () => {
      inserted = null;
      await assertLoreSourcesExist(
        doc.evidence.map((reference) => reference.sourceId),
        session,
      );
      if (predecessorIds.length > 0) {
        const predecessorFilter = {
          [idField]: { $in: predecessorIds },
          logicalKey: doc.logicalKey,
          "lineage.state": "active",
        } as unknown as Filter<T>;
        const predecessors = await col
          .find(predecessorFilter, { session })
          .project({ [idField]: 1 })
          .toArray();
        if (predecessors.length !== predecessorIds.length) {
          throw new Error(`${idField} predecessor 집합/CAS 불일치`);
        }
        const transitioned = await col.updateMany(
          predecessorFilter,
          {
            $set: {
              "lineage.state": "superseded",
              "lineage.supersededById": String(doc[idField as keyof T]),
              updatedAt: new Date(),
            },
          } as never,
          { session },
        );
        if (transitioned.modifiedCount !== predecessorIds.length) {
          throw new Error(`${idField} predecessor transition CAS 불일치`);
        }
      }
      const result = await col.insertOne(doc as never, { session });
      inserted = { ...doc, _id: result.insertedId } as WithId<T>;
    });
    if (!inserted) throw new Error(`${idField} assertion transaction 결과 없음`);
    return inserted;
  } finally {
    await session.endSession();
  }
}

export async function getLoreSourceById(
  sourceId: string,
  access: LoreAccessContext,
): Promise<WithId<LoreSource> | null> {
  if (!loreStableIdSchema.safeParse(sourceId).success) return null;
  const col = await loreSourcesCol();
  return col.findOne(
    combineAccessFilter<LoreSource>(access, { sourceId }),
  );
}

export async function findLoreAliases(
  alias: string,
  access: LoreAccessContext,
  limit = 50,
): Promise<WithId<LoreAlias>[]> {
  if (!(await isLoreProjectionGenerationReady())) return [];
  if (typeof alias !== "string") return [];
  const normalizedAlias = normalizeLoreAlias(alias);
  if (!normalizedAlias) return [];
  const col = await loreAliasesCol();
  return col
    .find(
      combineAccessFilter<LoreAlias>(access, {
        normalizedAlias,
        "lineage.state": "active",
      }),
    )
    .sort({ confidence: -1, updatedAt: -1 })
    .limit(normalizeLimit(limit, 50, 100))
    .toArray();
}

export function isLoreAliasSuccessor(
  predecessor: LoreAlias,
  successor: LoreAlias,
): boolean {
  return (
    successor.entityRef === predecessor.entityRef &&
    successor.aliasType === predecessor.aliasType &&
    successor.normalizedAlias === predecessor.normalizedAlias &&
    successor.lineage.state === "active" &&
    successor.lineage.supersedesIds?.includes(predecessor.aliasId) === true
  );
}

/** Atomically transitions an active alias and inserts its successor. */
export async function supersedeLoreAlias(
  aliasId: string,
  successor: CreateLoreAliasInput,
): Promise<WithId<LoreAlias> | null> {
  if (
    !loreStableIdSchema.safeParse(aliasId).success ||
    aliasId === successor.aliasId
  ) return null;
  return createLoreAlias({
    ...successor,
    lineage: {
      state: "active",
      supersedesIds: [...new Set([...(successor.lineage.supersedesIds ?? []), aliasId])],
    },
  });
}

export async function retconLoreAlias(
  aliasId: string,
  reason: string,
): Promise<WithId<LoreAlias> | null> {
  if (
    !loreStableIdSchema.safeParse(aliasId).success ||
    typeof reason !== "string"
  ) return null;
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1_000) return null;
  const col = await loreAliasesCol();
  const current = await col.findOne({ aliasId, "lineage.state": "active" });
  if (!current) return null;
  const now = new Date();
  return col.findOneAndUpdate(
    { aliasId, "lineage.state": "active", updatedAt: current.updatedAt },
    {
      $set: {
        "lineage.state": "retconned",
        "lineage.retconReason": normalizedReason,
        "lineage.retconnedAt": now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

export async function listLoreEdgesForEntity(
  entityRef: LoreEntityRef,
  access: LoreAccessContext,
  limit = 200,
): Promise<WithId<LoreEdge>[]> {
  if (!(await isLoreProjectionGenerationReady())) return [];
  const parsedRef = loreEntityRefSchema.safeParse(entityRef);
  if (!parsedRef.success) return [];
  const col = await loreEdgesCol();
  return col
    .find(
      combineAccessFilter<LoreEdge>(access, {
        $or: [{ fromRef: parsedRef.data }, { toRef: parsedRef.data }],
        "lineage.state": "active",
      }),
    )
    .sort({ confidence: -1, updatedAt: -1 })
    .limit(normalizeLimit(limit, 200, 500))
    .toArray();
}

export async function listLoreClaimsForSubject(
  subjectRef: LoreEntityRef,
  access: LoreAccessContext,
  statuses?: LoreRecordStatus[],
  limit = 200,
): Promise<WithId<LoreClaim>[]> {
  if (!(await isLoreProjectionGenerationReady())) return [];
  const parsedRef = loreEntityRefSchema.safeParse(subjectRef);
  if (!parsedRef.success) return [];
  const domainFilter: Filter<LoreClaim> = {
    subjectRef: parsedRef.data,
    "lineage.state": "active",
  };
  if (statuses?.length) domainFilter.status = { $in: statuses };
  const col = await loreClaimsCol();
  return col
    .find(combineAccessFilter<LoreClaim>(access, domainFilter))
    .sort({ predicate: 1, confidence: -1, updatedAt: -1 })
    .limit(normalizeLimit(limit, 200, 500))
    .toArray();
}

export function isLoreClaimSuccessor(
  predecessor: LoreClaim,
  successor: LoreClaim,
): boolean {
  return (
    successor.subjectRef === predecessor.subjectRef &&
    successor.predicate === predecessor.predicate &&
    successor.lineage.state === "active" &&
    successor.lineage.supersedesIds?.includes(predecessor.claimId) === true
  );
}

/** Atomically transitions an active claim and inserts its successor. */
export async function supersedeLoreClaim(
  claimId: string,
  successor: CreateLoreClaimInput,
): Promise<WithId<LoreClaim> | null> {
  if (
    !loreStableIdSchema.safeParse(claimId).success ||
    claimId === successor.claimId
  ) return null;
  return createLoreClaim({
    ...successor,
    lineage: {
      state: "active",
      supersedesIds: [...new Set([...(successor.lineage.supersedesIds ?? []), claimId])],
    },
  });
}

export async function retconLoreClaim(
  claimId: string,
  reason: string,
): Promise<WithId<LoreClaim> | null> {
  if (
    !loreStableIdSchema.safeParse(claimId).success ||
    typeof reason !== "string"
  ) return null;
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1_000) return null;
  const col = await loreClaimsCol();
  const current = await col.findOne({ claimId, "lineage.state": "active" });
  if (!current) return null;
  const now = new Date();
  return col.findOneAndUpdate(
    { claimId, "lineage.state": "active", updatedAt: current.updatedAt },
    {
      $set: {
        "lineage.state": "retconned",
        "lineage.retconReason": normalizedReason,
        "lineage.retconnedAt": now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

export function isLoreEdgeSuccessor(
  predecessor: LoreEdge,
  successor: LoreEdge,
): boolean {
  return (
    successor.fromRef === predecessor.fromRef &&
    successor.relation === predecessor.relation &&
    successor.toRef === predecessor.toRef &&
    successor.lineage.state === "active" &&
    successor.lineage.supersedesIds?.includes(predecessor.edgeId) === true
  );
}

/** Atomically transitions an active edge and inserts its successor. */
export async function supersedeLoreEdge(
  edgeId: string,
  successor: CreateLoreEdgeInput,
): Promise<WithId<LoreEdge> | null> {
  if (
    !loreStableIdSchema.safeParse(edgeId).success ||
    edgeId === successor.edgeId
  ) return null;
  return createLoreEdge({
    ...successor,
    lineage: {
      state: "active",
      supersedesIds: [...new Set([...(successor.lineage.supersedesIds ?? []), edgeId])],
    },
  });
}

export async function retconLoreEdge(
  edgeId: string,
  reason: string,
): Promise<WithId<LoreEdge> | null> {
  if (
    !loreStableIdSchema.safeParse(edgeId).success ||
    typeof reason !== "string"
  ) return null;
  const normalizedReason = reason.trim();
  if (!normalizedReason || normalizedReason.length > 1_000) return null;
  const col = await loreEdgesCol();
  const current = await col.findOne({ edgeId, "lineage.state": "active" });
  if (!current) return null;
  const now = new Date();
  return col.findOneAndUpdate(
    { edgeId, "lineage.state": "active", updatedAt: current.updatedAt },
    {
      $set: {
        "lineage.state": "retconned",
        "lineage.retconReason": normalizedReason,
        "lineage.retconnedAt": now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

/* ── Rebuildable search projection ── */

export class LoreSearchProjectionOwnershipError extends Error {
  readonly code = "LORE_SEARCH_PROJECTION_OWNERSHIP_CONFLICT";

  constructor(
    readonly entityRef: LoreEntityRef,
    readonly currentOwner: string,
    readonly requestedOwner: string,
  ) {
    super(`lore search projection ownership conflict: ${entityRef}`);
    this.name = "LoreSearchProjectionOwnershipError";
  }
}

export async function putLoreSearchDocument(
  input: PutLoreSearchDocumentInput,
): Promise<WithId<LoreSearchDocument>> {
  const now = new Date();
  const candidate = loreSearchDocumentSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  }) as LoreSearchDocument;
  const { createdAt, ...setFields } = candidate;
  const col = await loreSearchDocumentsCol();
  const ownerFilter = {
    entityRef: candidate.entityRef,
    projectionOwner: candidate.projectionOwner,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const client = await getClient();
    const session = client.startSession();
    let saved: WithId<LoreSearchDocument> | null = null;
    try {
      await session.withTransaction(async () => {
        saved = null;
        await assertLoreSourcesExist(candidate.sourceIds, session);
        saved = await col.findOneAndUpdate(
          ownerFilter,
          {
            $set: setFields,
            $setOnInsert: { createdAt },
          },
          { upsert: true, returnDocument: "after", session },
        );
      });
      if (!saved) {
        throw new Error(`lore search projection 저장 실패: ${candidate.entityRef}`);
      }
      return saved;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11_000) throw error;
      const current = await col.findOne({ entityRef: candidate.entityRef });
      if (current && current.projectionOwner !== candidate.projectionOwner) {
        throw new LoreSearchProjectionOwnershipError(
          candidate.entityRef,
          current.projectionOwner,
          candidate.projectionOwner,
        );
      }
      if (attempt === 1) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new Error(`lore search projection 저장 재시도 실패: ${candidate.entityRef}`);
}

export interface LoreSearchQuery {
  query?: string;
  entityKinds?: LoreEntityKind[];
  statuses?: LoreRecordStatus[];
  categories?: string[];
  tags?: string[];
  factionCodes?: string[];
  institutionCodes?: string[];
  sessionIds?: string[];
  limit?: number;
}

export async function searchLoreDocuments(
  input: LoreSearchQuery,
  access: LoreAccessContext,
): Promise<WithId<LoreSearchDocument>[]> {
  if (!(await isLoreProjectionGenerationReady())) return [];
  const validatedInput = loreSearchQuerySchema.parse(input) as LoreSearchQuery;
  const domainFilter: Filter<LoreSearchDocument> = {};
  const query = validatedInput.query;
  if (query) domainFilter.$text = { $search: query };
  if (validatedInput.entityKinds?.length) {
    domainFilter.entityKind = { $in: validatedInput.entityKinds };
  }
  if (validatedInput.statuses?.length) domainFilter.status = { $in: validatedInput.statuses };
  if (validatedInput.categories?.length) {
    domainFilter["facets.categories"] = { $in: validatedInput.categories };
  }
  if (validatedInput.tags?.length) {
    domainFilter["facets.tags"] = { $in: validatedInput.tags };
  }
  if (validatedInput.factionCodes?.length) {
    domainFilter["facets.factionCodes"] = { $in: validatedInput.factionCodes };
  }
  if (validatedInput.institutionCodes?.length) {
    domainFilter["facets.institutionCodes"] = { $in: validatedInput.institutionCodes };
  }
  if (validatedInput.sessionIds?.length) {
    domainFilter["facets.sessionIds"] = { $in: validatedInput.sessionIds };
  }

  const col = await loreSearchDocumentsCol();
  const cursor = col.find(
    combineAccessFilter<LoreSearchDocument>(access, domainFilter),
  );
  const sort: Sort = query
    ? ({ score: { $meta: "textScore" } } as Sort)
    : { updatedAt: -1, _id: -1 };
  return cursor
    .sort(sort)
    .limit(validatedInput.limit ?? 50)
    .toArray();
}

export async function getLoreSearchDocument(
  entityRef: LoreEntityRef,
  access: LoreAccessContext,
): Promise<WithId<LoreSearchDocument> | null> {
  if (!(await isLoreProjectionGenerationReady())) return null;
  const parsedRef = loreEntityRefSchema.safeParse(entityRef);
  if (!parsedRef.success) return null;
  const col = await loreSearchDocumentsCol();
  return col.findOne(
    combineAccessFilter<LoreSearchDocument>(access, { entityRef: parsedRef.data }),
  );
}

/* ── Auditable ingestion lifecycle ── */

const TERMINAL_INGESTION_STATUSES = new Set<LoreIngestionStatus>([
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);

export const LORE_INGESTION_RUN_LEASE_MS = 30 * 60 * 1_000;

export function buildLoreIngestionTransitionCandidate(
  current: LoreIngestionRun,
  nextStatus: LoreIngestionStatus,
  patch: TransitionLoreIngestionRunPatch = {},
  now = new Date(),
): LoreIngestionRun {
  const terminal = TERMINAL_INGESTION_STATUSES.has(nextStatus);
  const running = nextStatus === "running";
  return loreIngestionRunSchema.parse({
    ...current,
    ...patch,
    status: nextStatus,
    startedAt: running ? (current.startedAt ?? now) : current.startedAt,
    heartbeatAt: running ? now : terminal ? now : current.heartbeatAt,
    leaseExpiresAt: running
      ? new Date(now.getTime() + LORE_INGESTION_RUN_LEASE_MS)
      : undefined,
    completedAt: terminal ? now : undefined,
    updatedAt: now,
  }) as LoreIngestionRun;
}

export function isLoreIngestionTransitionAllowed(
  current: LoreIngestionStatus,
  next: LoreIngestionStatus,
): boolean {
  if (
    !loreIngestionStatusSchema.safeParse(current).success ||
    !loreIngestionStatusSchema.safeParse(next).success
  ) return false;
  if (TERMINAL_INGESTION_STATUSES.has(current)) return false;
  if (current === next) return current === "planned" || current === "running";
  if (current === "planned") return next === "running" || next === "cancelled";
  return TERMINAL_INGESTION_STATUSES.has(next);
}

export async function createLoreIngestionRun(
  input: CreateLoreIngestionRunInput,
): Promise<WithId<LoreIngestionRun>> {
  const now = new Date();
  const doc = loreIngestionRunSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  }) as LoreIngestionRun;
  const col = await loreIngestionRunsCol();
  const client = await getClient();
  const session = client.startSession();
  try {
    let created: WithId<LoreIngestionRun> | null = null;
    await session.withTransaction(async () => {
      created = null;
      await assertLoreSourcesExist(doc.sourceIds, session);
      const result = await col.insertOne(doc, { session });
      created = { ...doc, _id: result.insertedId } as WithId<LoreIngestionRun>;
    });
    if (!created) throw new Error(`lore ingestion run transaction 결과 없음: ${doc.runId}`);
    return created;
  } finally {
    await session.endSession();
  }
}

export interface TransitionLoreIngestionRunPatch {
  sourceIds?: string[];
  manifestHash?: string;
  parserVersion?: string;
  stats?: LoreIngestionStats;
  errors?: LoreIngestionError[];
}

export async function transitionLoreIngestionRun(
  runId: string,
  nextStatus: LoreIngestionStatus,
  patch: TransitionLoreIngestionRunPatch = {},
): Promise<WithId<LoreIngestionRun> | null> {
  if (!loreStableIdSchema.safeParse(runId).success) return null;
  const col = await loreIngestionRunsCol();
  const client = await getClient();
  const session = client.startSession();
  let transitioned: WithId<LoreIngestionRun> | null = null;
  try {
    await session.withTransaction(async () => {
      transitioned = null;
      const current = await col.findOne({ runId }, { session });
      if (!current || !isLoreIngestionTransitionAllowed(current.status, nextStatus)) {
        return;
      }

      const now = new Date();
      const terminal = TERMINAL_INGESTION_STATUSES.has(nextStatus);
      const { _id: _currentId, ...currentDocument } = current;
      const candidate = buildLoreIngestionTransitionCandidate(
        currentDocument,
        nextStatus,
        patch,
        now,
      );
      await assertLoreSourcesExist(candidate.sourceIds, session);
      const {
        _id: _ignoredId,
        createdAt: _ignoredCreatedAt,
        runId: _ignoredRunId,
        leaseExpiresAt: _candidateLease,
        ...candidateSetFields
      } = candidate;
      const setFields = Object.fromEntries(
        Object.entries(candidateSetFields).filter(([, value]) => value !== undefined),
      );
      if (_candidateLease) setFields.leaseExpiresAt = _candidateLease;

      transitioned = await col.findOneAndUpdate(
        { runId, status: current.status, updatedAt: current.updatedAt },
        terminal
          ? { $set: setFields, $unset: { leaseExpiresAt: "" } }
          : { $set: setFields },
        { returnDocument: "after", session },
      );
    });
    return transitioned;
  } finally {
    await session.endSession();
  }
}
