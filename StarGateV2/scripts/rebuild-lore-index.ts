/**
 * Existing domain SSOT를 lore auxiliary collections로 투영한다.
 *
 * 기본은 read-only dry-run이다. 실제 쓰기는 명시적 운영 승인 뒤에만:
 *   pnpm run lore:rebuild -- --execute --yes
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LORE_INDEX_DEFINITIONS,
  SESSION_REPORT_INDEX_DEFINITIONS,
} from "@stargate/shared-db";
import {
  loreAliasSchema,
  loreClaimSchema,
  loreEdgeSchema,
  loreIngestionRunSchema,
  loreSourceDocumentSchema,
} from "@stargate/shared-db/schemas";
import type {
  LoreAlias,
  LoreClaim,
  LoreEdge,
  LoreIngestionRun,
  LoreSearchDocument,
  LoreSource,
} from "@stargate/shared-db/types";
import {
  MongoClient,
  type AnyBulkWriteOperation,
  type ClientSession,
  type Collection,
  type Db,
  type Document,
} from "mongodb";

import {
  buildLoreProjection,
  DOMAIN_SEARCH_PROJECTION_OWNER,
  loreAliasLogicalKey,
  loreClaimLogicalKey,
  loreEdgeLogicalKey,
  loreSha256,
  sameActiveAssertionPayload,
  stableJson,
  type LoreDomainSnapshot,
  type LoreProjectionBundle,
} from "./lib/lore-index-projection.ts";
import {
  ingestionLeaseFields,
  reconcileExpiredIngestionRuns,
} from "./lib/ingestion-run-lease.ts";
import { indexDefinitionIssues } from "./lib/lore-index-inspection.ts";

function loadEnvFile(fileName: string): void {
  try {
    const content = readFileSync(resolve(process.cwd(), fileName), "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    // Optional. main validates MONGODB_URI.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

if (EXECUTE && !YES) {
  throw new Error("[lore-rebuild] --execute에는 --yes 확인이 필요합니다.");
}

const MONGODB_URI = process.env.MONGODB_URI;
if (
  process.env.DB_NAME &&
  process.env.MONGODB_DB_NAME &&
  process.env.DB_NAME !== process.env.MONGODB_DB_NAME
) {
  throw new Error(
    `[lore-rebuild] DB_NAME(${process.env.DB_NAME})과 MONGODB_DB_NAME(${process.env.MONGODB_DB_NAME})이 다릅니다.`,
  );
}
const DB_NAME = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";
if (EXECUTE && !process.env.DB_NAME && !process.env.MONGODB_DB_NAME) {
  throw new Error("[lore-rebuild] WRITE에는 DB_NAME 또는 MONGODB_DB_NAME을 명시해야 합니다.");
}
const TARGET_HOST = (() => {
  if (!MONGODB_URI) return "not-configured";
  try {
    return new URL(MONGODB_URI).host;
  } catch {
    return "unparseable";
  }
})();

interface SupersedeOperation {
  id: string;
  successorId: string;
}

interface RetconOperation {
  id: string;
  reason: string;
}

interface AssertionPlan<T> {
  inserts: T[];
  supersedes: SupersedeOperation[];
  retcons: RetconOperation[];
  unchanged: number;
  conflicts: string[];
}

interface RebuildPlan {
  sourceInserts: LoreSource[];
  sourceUnchanged: number;
  aliases: AssertionPlan<LoreAlias>;
  edges: AssertionPlan<LoreEdge>;
  claims: AssertionPlan<LoreClaim>;
  searchUpserts: LoreSearchDocument[];
  searchUnchanged: number;
  staleSearchRefs: string[];
  conflicts: string[];
}

interface RebuildState {
  snapshot: LoreDomainSnapshot;
  bundle: LoreProjectionBundle;
  manifest: LoreSource;
  plan: RebuildPlan;
}

interface AssertionConfig<T extends Document> {
  idField: string;
  desired: T[];
  existing: T[];
  logicalKey: (value: T) => string;
  parse: (value: unknown) => T;
  managedIdPrefix: string;
}

function withoutId<T extends Document>(value: T): T {
  const { _id, ...rest } = value;
  void _id;
  return rest as T;
}

function immutableSourcePayload(source: Document): Document {
  const { _id, capturedAt, createdAt, updatedAt, ...immutable } = source;
  void _id;
  void capturedAt;
  void createdAt;
  void updatedAt;
  return immutable;
}

function parseExisting<T extends Document>(
  value: T,
  parse: (candidate: unknown) => T,
): T {
  return parse(withoutId(value));
}

function assertionPlan<T extends Document>(
  config: AssertionConfig<T>,
): AssertionPlan<T> {
  const inserts: T[] = [];
  const supersedes: SupersedeOperation[] = [];
  const retcons: RetconOperation[] = [];
  const conflicts: string[] = [];
  let unchanged = 0;

  const desiredByLogical = new Map(
    config.desired.map((value) => [config.logicalKey(value), value]),
  );
  const existingById = new Map<string, T>();
  const activeByLogical = new Map<string, T[]>();
  for (const raw of config.existing) {
    let existing: T;
    try {
      existing = parseExisting(raw, config.parse);
    } catch (error) {
      conflicts.push(
        `${config.idField} schema invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const id = String(existing[config.idField]);
    existingById.set(id, existing);
    if ((existing.lineage as { state?: string } | undefined)?.state === "active") {
      const logical = config.logicalKey(existing);
      const values = activeByLogical.get(logical) ?? [];
      values.push(existing);
      activeByLogical.set(logical, values);
    }
  }

  for (const desired of config.desired) {
    const id = String(desired[config.idField]);
    const logical = config.logicalKey(desired);
    const activeForLogical = activeByLogical.get(logical) ?? [];
    const exact = existingById.get(id);
    if (exact) {
      if ((exact.lineage as { state?: string } | undefined)?.state !== "active") {
        conflicts.push(`${config.idField} terminal record 재활성화 금지: ${id}`);
      } else if (
        activeForLogical.length !== 1 ||
        String(activeForLogical[0]?.[config.idField]) !== id
      ) {
        conflicts.push(
          `${config.idField} active logical identity 중복: ${logical} (${activeForLogical.map((value) => String(value[config.idField])).join(",")})`,
        );
      } else if (!sameActiveAssertionPayload(exact, desired)) {
        conflicts.push(`${config.idField} immutable payload 충돌: ${id}`);
      } else {
        unchanged += 1;
      }
      continue;
    }

    const predecessors = activeForLogical;
    if (predecessors.length > 100) {
      conflicts.push(`${config.idField} predecessor 100개 초과: ${logical}`);
      continue;
    }
    const predecessorIds = predecessors.map((value) =>
      String(value[config.idField]),
    );
    const candidate = config.parse({
      ...desired,
      lineage:
        predecessorIds.length > 0
          ? { state: "active", supersedesIds: predecessorIds }
          : { state: "active" },
    });
    inserts.push(candidate);
    for (const predecessorId of predecessorIds) {
      supersedes.push({ id: predecessorId, successorId: id });
    }
  }

  for (const [logical, values] of activeByLogical) {
    if (desiredByLogical.has(logical)) continue;
    for (const value of values) {
      const id = String(value[config.idField]);
      if (!id.startsWith(config.managedIdPrefix)) continue;
      retcons.push({
        id,
        reason: "domain SSOT의 최신 search rebuild에서 더 이상 파생되지 않음",
      });
    }
  }

  return { inserts, supersedes, retcons, unchanged, conflicts };
}

function manifestSource(bundle: LoreProjectionBundle): LoreSource {
  const manifestHash = loreSha256(
    stableJson({
      sources: bundle.sources.map((source) => source.sourceId).sort(),
      aliases: bundle.aliases.map((alias) => alias.aliasId).sort(),
      edges: bundle.edges.map((edge) => edge.edgeId).sort(),
      claims: bundle.claims.map((claim) => claim.claimId).sort(),
      search: bundle.searchDocuments
        .map((doc) => `${doc.entityRef}:${doc.contentHash}`)
        .sort(),
    }),
  );
  const sourceUpdatedAt = bundle.searchDocuments.reduce(
    (latest, doc) =>
      doc.sourceUpdatedAt > latest ? doc.sourceUpdatedAt : latest,
    new Date(0),
  );
  return loreSourceDocumentSchema.parse({
    sourceId: `idx-manifest:${manifestHash.slice(0, 48)}`,
    kind: "database-record",
    title: "Lore search rebuild domain manifest",
    locator: { kind: "database", value: "lore-index/domain-snapshot" },
    contentHash: manifestHash,
    access: { visibility: "authenticated" },
    capturedAt: sourceUpdatedAt,
    createdAt: sourceUpdatedAt,
    updatedAt: sourceUpdatedAt,
  }) as LoreSource;
}

async function loadSnapshot(
  db: Db,
  session?: ClientSession,
): Promise<LoreDomainSnapshot> {
  const [characters, wikiPages, sessionReports, masterItems, factions, institutions] =
    await Promise.all([
      db
        .collection("characters")
        .find({}, { session })
        .project({
          codename: 1,
          type: 1,
          role: 1,
          factionCode: 1,
          institutionCode: 1,
          ownerId: 1,
          isPublic: 1,
          lore: 1,
          loreMd: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .toArray(),
      db
        .collection("wiki_pages")
        .find({}, { session })
        .project({
          slug: 1,
          title: 1,
          content: 1,
          summary: 1,
          category: 1,
          tags: 1,
          isPublic: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .toArray(),
      db.collection("session_reports").find({}, { session }).toArray(),
      db
        .collection("master_items")
        .find({}, { session })
        .project({
          slug: 1,
          code: 1,
          name: 1,
          nameEn: 1,
          category: 1,
          description: 1,
          effect: 1,
          damage: 1,
          tags: 1,
          isPublic: 1,
          isAvailable: 1,
          lore: 1,
          loreMd: 1,
          sourceClass: 1,
          workshop: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .toArray(),
      db.collection("factions").find({}, { session }).toArray(),
      db.collection("institutions").find({}, { session }).toArray(),
    ]);
  return { characters, wikiPages, sessionReports, masterItems, factions, institutions };
}

async function buildRebuildPlan(
  db: Db,
  bundle: LoreProjectionBundle,
  manifest: LoreSource,
  session?: ClientSession,
): Promise<RebuildPlan> {
  const sourceCol = db.collection<LoreSource>("lore_sources");
  const aliasCol = db.collection<LoreAlias>("lore_aliases");
  const edgeCol = db.collection<LoreEdge>("lore_edges");
  const claimCol = db.collection<LoreClaim>("lore_claims");
  const searchCol = db.collection<LoreSearchDocument>("lore_search_documents");
  const desiredSources = [...bundle.sources, manifest];
  const desiredSourceIds = desiredSources.map((source) => source.sourceId);
  const [existingSources, existingAliases, existingEdges, existingClaims, existingSearch] =
    await Promise.all([
      sourceCol
        .find({ sourceId: { $in: desiredSourceIds } }, { session })
        .toArray(),
      aliasCol.find({}, { session }).toArray(),
      edgeCol.find({}, { session }).toArray(),
      claimCol.find({}, { session }).toArray(),
      searchCol.find({}, { session }).toArray(),
    ]);

  const existingSourceIds = new Set(existingSources.map((source) => source.sourceId));
  const sourceInserts = desiredSources.filter(
    (source) => !existingSourceIds.has(source.sourceId),
  );
  const sourceConflicts: string[] = [];
  const desiredSourceById = new Map(
    desiredSources.map((source) => [source.sourceId, source]),
  );
  for (const raw of existingSources) {
    try {
      const existing = loreSourceDocumentSchema.parse(withoutId(raw));
      const desired = desiredSourceById.get(existing.sourceId);
      if (
        desired &&
        stableJson(immutableSourcePayload(existing)) !==
          stableJson(immutableSourcePayload(desired))
      ) {
        sourceConflicts.push(`source immutable provenance 충돌: ${existing.sourceId}`);
      }
    } catch (error) {
      sourceConflicts.push(
        `source schema invalid ${raw.sourceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const aliases = assertionPlan<LoreAlias>({
    idField: "aliasId",
    desired: bundle.aliases,
    existing: existingAliases,
    logicalKey: loreAliasLogicalKey,
    parse: (value) => loreAliasSchema.parse(value) as LoreAlias,
    managedIdPrefix: "idx-alias:",
  });
  const edges = assertionPlan<LoreEdge>({
    idField: "edgeId",
    desired: bundle.edges,
    existing: existingEdges,
    logicalKey: loreEdgeLogicalKey,
    parse: (value) => loreEdgeSchema.parse(value) as LoreEdge,
    managedIdPrefix: "idx-edge:",
  });
  const claims = assertionPlan<LoreClaim>({
    idField: "claimId",
    desired: bundle.claims,
    existing: existingClaims,
    logicalKey: loreClaimLogicalKey,
    parse: (value) => loreClaimSchema.parse(value) as LoreClaim,
    managedIdPrefix: "idx-claim:",
  });

  const existingSearchByRef = new Map(
    existingSearch.map((doc) => [doc.entityRef, doc]),
  );
  let searchUnchanged = 0;
  for (const desired of bundle.searchDocuments) {
    const existing = existingSearchByRef.get(desired.entityRef);
    if (existing && existing.projectionOwner !== DOMAIN_SEARCH_PROJECTION_OWNER) {
      sourceConflicts.push(
        `search projection ownership conflict ${desired.entityRef}: ${String(existing.projectionOwner)}`,
      );
      continue;
    }
    if (
      existing?.contentHash === desired.contentHash &&
      existing.projectionVersion === desired.projectionVersion &&
      existing.sourceUpdatedAt?.getTime() === desired.sourceUpdatedAt.getTime()
    ) {
      searchUnchanged += 1;
    }
  }
  const desiredRefs = new Set(bundle.searchDocuments.map((doc) => doc.entityRef));
  const staleSearchRefs = existingSearch
    .filter((doc) => doc.projectionOwner === DOMAIN_SEARCH_PROJECTION_OWNER)
    .map((doc) => doc.entityRef)
    .filter((ref) => !desiredRefs.has(ref));
  const conflicts = [
    ...sourceConflicts,
    ...aliases.conflicts,
    ...edges.conflicts,
    ...claims.conflicts,
  ];

  return {
    sourceInserts,
    sourceUnchanged: desiredSources.length - sourceInserts.length,
    aliases,
    edges,
    claims,
    searchUpserts: bundle.searchDocuments,
    searchUnchanged,
    staleSearchRefs,
    conflicts,
  };
}

async function loadRebuildState(
  db: Db,
  session?: ClientSession,
): Promise<RebuildState> {
  const snapshot = await loadSnapshot(db, session);
  const bundle = buildLoreProjection(snapshot);
  const manifest = manifestSource(bundle);
  const plan = await buildRebuildPlan(db, bundle, manifest, session);
  return { snapshot, bundle, manifest, plan };
}

function hasOwn(value: Document, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function versionFilter(
  row: Document,
  options: { access: boolean; workshop: boolean },
): Document {
  const filter: Document = {
    _id: row._id,
    updatedAt: hasOwn(row, "updatedAt")
      ? row.updatedAt
      : { $exists: false },
  };
  if (options.access) {
    filter.isPublic = hasOwn(row, "isPublic")
      ? row.isPublic
      : { $exists: false };
  }
  if (options.workshop) {
    filter.workshop = hasOwn(row, "workshop")
      ? row.workshop
      : { $exists: false };
  }
  return filter;
}

function sourceAnchor(
  row: Document,
  fields: string[],
): { field: string; value: string } {
  for (const field of fields) {
    const value = typeof row[field] === "string" ? row[field].trim() : "";
    if (value) return { field, value };
  }
  throw new Error(
    `source version CAS anchor 없음: _id=${String(row._id)} fields=${fields.join(",")}`,
  );
}

/**
 * Lock every source version inside the rebuild transaction with an idempotent
 * update. The exact updatedAt/access filter turns a concurrent source edit into
 * a write conflict/CAS failure instead of committing a stale or overexposed
 * projection as succeeded.
 */
async function lockSnapshotVersions(
  db: Db,
  snapshot: LoreDomainSnapshot,
  session: ClientSession,
  lockToken: string,
): Promise<void> {
  const groups: Array<{
    collection: string;
    rows: Document[];
    anchorFields: string[];
    access: boolean;
    workshop: boolean;
  }> = [
    {
      collection: "characters",
      rows: snapshot.characters,
      anchorFields: ["codename"],
      access: true,
      workshop: false,
    },
    {
      collection: "wiki_pages",
      rows: snapshot.wikiPages,
      anchorFields: ["slug"],
      access: true,
      workshop: false,
    },
    {
      collection: "session_reports",
      rows: snapshot.sessionReports,
      anchorFields: ["sessionId"],
      access: false,
      workshop: false,
    },
    {
      collection: "master_items",
      rows: snapshot.masterItems,
      anchorFields: ["slug", "code", "name"],
      access: true,
      workshop: true,
    },
    {
      collection: "factions",
      rows: snapshot.factions,
      anchorFields: ["code", "slug"],
      access: true,
      workshop: false,
    },
    {
      collection: "institutions",
      rows: snapshot.institutions,
      anchorFields: ["code", "slug"],
      access: true,
      workshop: false,
    },
  ];

  for (const group of groups) {
    if (group.rows.length === 0) continue;
    const collection = db.collection(group.collection);
    const operations: AnyBulkWriteOperation<Document>[] = group.rows.map((row) => {
      const anchor = sourceAnchor(row, group.anchorFields);
      const filter = {
        ...versionFilter(row, {
          access: group.access,
          workshop: group.workshop,
        }),
        [anchor.field]: anchor.value,
        _loreProjectionLock: { $exists: false },
      };
      return {
        updateOne: {
          filter,
          update: { $set: { _loreProjectionLock: lockToken } },
        },
      };
    });
    const result = await collection.bulkWrite(operations, {
      ordered: true,
      session,
    });
    if (result.modifiedCount !== group.rows.length) {
      throw new Error(
        `source version CAS 실패: ${group.collection} expected=${group.rows.length} actual=${result.modifiedCount}`,
      );
    }
  }
}

async function releaseSnapshotLocks(
  db: Db,
  snapshot: LoreDomainSnapshot,
  session: ClientSession,
  lockToken: string,
): Promise<void> {
  const groups = [
    ["characters", snapshot.characters],
    ["wiki_pages", snapshot.wikiPages],
    ["session_reports", snapshot.sessionReports],
    ["master_items", snapshot.masterItems],
    ["factions", snapshot.factions],
    ["institutions", snapshot.institutions],
  ] as const;

  for (const [collectionName, rows] of groups) {
    if (rows.length === 0) continue;
    const collection = db.collection(collectionName);
    const operations: AnyBulkWriteOperation<Document>[] = rows.map((row) => ({
      updateOne: {
        filter: { _id: row._id, _loreProjectionLock: lockToken },
        update: { $unset: { _loreProjectionLock: "" } },
      },
    }));
    const result = await collection.bulkWrite(operations, {
      ordered: true,
      session,
    });
    if (result.modifiedCount !== rows.length) {
      throw new Error(
        `source version lock 해제 실패: ${collectionName} expected=${rows.length} actual=${result.modifiedCount}`,
      );
    }
  }
}

async function assertLoreIndexesReady(db: Db): Promise<void> {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const [collection, expectedIndexes] of Object.entries(
    LORE_INDEX_DEFINITIONS,
  )) {
    const exists = await db
      .listCollections({ name: collection }, { nameOnly: true })
      .hasNext();
    const actualIndexes = exists
      ? await db.collection(collection).listIndexes().toArray()
      : [];
    for (const expected of expectedIndexes) {
      const actual = actualIndexes.find((index) => index.name === expected.name);
      if (!actual) {
        missing.push(`${collection}.${String(expected.name)}`);
      } else if (indexDefinitionIssues(expected, actual).length > 0) {
        invalid.push(`${collection}.${String(expected.name)}:definition`);
      }
    }
  }
  const reportIndexes = await db
    .collection("session_reports")
    .listIndexes()
    .toArray();
  const reportIdentityIndex = reportIndexes.find(
    (index) => index.name === "session_reports_sessionId_unique",
  );
  const expectedReportIdentityIndex = SESSION_REPORT_INDEX_DEFINITIONS.find(
    (index) => index.name === "session_reports_sessionId_unique",
  );
  if (!reportIdentityIndex || !expectedReportIdentityIndex) {
    missing.push("session_reports.session_reports_sessionId_unique");
  } else if (
    indexDefinitionIssues(
      expectedReportIdentityIndex,
      reportIdentityIndex,
    ).length > 0
  ) {
    invalid.push("session_reports.session_reports_sessionId_unique:definition");
  }
  if (missing.length > 0 || invalid.length > 0) {
    throw new Error(
      `[lore-rebuild] lore:storage 선행 필요 (missing=${missing.join(",") || "none"}; invalid=${invalid.join(",") || "none"})`,
    );
  }
}

function assertionWriteCount<T>(plan: AssertionPlan<T>): number {
  return plan.inserts.length + plan.supersedes.length + plan.retcons.length;
}

function planWriteCount(plan: RebuildPlan): number {
  return (
    plan.sourceInserts.length +
    assertionWriteCount(plan.aliases) +
    assertionWriteCount(plan.edges) +
    assertionWriteCount(plan.claims) +
    (plan.searchUpserts.length - plan.searchUnchanged) +
    plan.staleSearchRefs.length
  );
}

function printPlan(
  snapshot: LoreDomainSnapshot,
  bundle: LoreProjectionBundle,
  plan: RebuildPlan,
): void {
  const domainCount = Object.values(snapshot).reduce(
    (sum, rows) => sum + rows.length,
    0,
  );
  console.log(
    `[lore-rebuild] ${EXECUTE ? "WRITE" : "DRY-RUN"} | domain=${domainCount} sources=${bundle.sources.length} aliases=${bundle.aliases.length} edges=${bundle.edges.length} claims=${bundle.claims.length} search=${bundle.searchDocuments.length}`,
  );
  console.log(
    `[lore-rebuild] planned writes=${planWriteCount(plan)} | source+${plan.sourceInserts.length} alias+${plan.aliases.inserts.length}/supersede=${plan.aliases.supersedes.length}/retcon=${plan.aliases.retcons.length} edge+${plan.edges.inserts.length}/supersede=${plan.edges.supersedes.length}/retcon=${plan.edges.retcons.length} claim+${plan.claims.inserts.length}/supersede=${plan.claims.supersedes.length}/retcon=${plan.claims.retcons.length} searchChanged=${plan.searchUpserts.length - plan.searchUnchanged} searchDelete=${plan.staleSearchRefs.length}`,
  );
  if (bundle.warnings.length > 0) {
    console.warn(`[lore-rebuild] warnings=${bundle.warnings.length}`);
    const visible = VERBOSE ? bundle.warnings : bundle.warnings.slice(0, 10);
    for (const warning of visible) console.warn(`  - ${warning}`);
    if (!VERBOSE && bundle.warnings.length > visible.length) {
      console.warn("  - 나머지는 --verbose로 확인");
    }
  }
  if (plan.conflicts.length > 0) {
    console.error(`[lore-rebuild] conflicts=${plan.conflicts.length}`);
    for (const conflict of plan.conflicts) console.error(`  - ${conflict}`);
  }
}

async function insertSources(
  collection: Collection<LoreSource>,
  values: LoreSource[],
  session: ClientSession,
): Promise<void> {
  if (values.length === 0) return;
  const result = await collection.bulkWrite(
    values.map((value) => ({
      updateOne: {
        filter: { sourceId: value.sourceId },
        update: { $setOnInsert: value },
        upsert: true,
      },
    })),
    { ordered: true, session },
  );
  if (result.matchedCount + result.upsertedCount !== values.length) {
    throw new Error(
      `source insert CAS 실패: expected=${values.length} actual=${result.matchedCount + result.upsertedCount}`,
    );
  }
}

async function ensureDurableSource(db: Db, source: LoreSource): Promise<void> {
  const collection = db.collection<LoreSource>("lore_sources");
  await collection.updateOne(
    { sourceId: source.sourceId },
    { $setOnInsert: source },
    { upsert: true },
  );
  const saved = await collection.findOne({ sourceId: source.sourceId });
  if (!saved) throw new Error(`durable source 재조회 실패: ${source.sourceId}`);
  const parsed = loreSourceDocumentSchema.parse(withoutId(saved));
  if (
    stableJson(immutableSourcePayload(parsed)) !==
    stableJson(immutableSourcePayload(source))
  ) {
    throw new Error(`durable source provenance 충돌: ${source.sourceId}`);
  }
}

async function applyAssertionPlan<T extends Document>(
  collection: Collection<T>,
  plan: AssertionPlan<T>,
  idField: string,
  session: ClientSession,
): Promise<void> {
  if (plan.supersedes.length > 0) {
    const transitionAt = new Date();
    const result = await collection.bulkWrite(
      plan.supersedes.map((transition) => ({
        updateOne: {
          filter: {
            [idField]: transition.id,
            "lineage.state": "active",
          } as never,
          update: {
            $set: {
              "lineage.state": "superseded",
              "lineage.supersededById": transition.successorId,
              updatedAt: transitionAt,
            },
          } as never,
        },
      })),
      { ordered: true, session },
    );
    if (result.modifiedCount !== plan.supersedes.length) {
      throw new Error(
        `${idField} supersede CAS 실패: expected=${plan.supersedes.length} actual=${result.modifiedCount}`,
      );
    }
  }
  if (plan.inserts.length > 0) {
    const result = await collection.bulkWrite(
      plan.inserts.map((value) => ({
        updateOne: {
          filter: { [idField]: String(value[idField]) } as never,
          update: { $setOnInsert: value } as never,
          upsert: true,
        },
      })),
      { ordered: true, session },
    );
    if (result.matchedCount + result.upsertedCount !== plan.inserts.length) {
      throw new Error(
        `${idField} insert CAS 실패: expected=${plan.inserts.length} actual=${result.matchedCount + result.upsertedCount}`,
      );
    }
  }
  if (plan.retcons.length > 0) {
    const retconnedAt = new Date();
    const result = await collection.bulkWrite(
      plan.retcons.map((transition) => ({
        updateOne: {
          filter: {
            [idField]: transition.id,
            "lineage.state": "active",
          } as never,
          update: {
            $set: {
              "lineage.state": "retconned",
              "lineage.retconReason": transition.reason,
              "lineage.retconnedAt": retconnedAt,
              updatedAt: retconnedAt,
            },
          } as never,
        },
      })),
      { ordered: true, session },
    );
    if (result.modifiedCount !== plan.retcons.length) {
      throw new Error(
        `${idField} retcon CAS 실패: expected=${plan.retcons.length} actual=${result.modifiedCount}`,
      );
    }
  }
}

async function putSearchDocuments(
  collection: Collection<LoreSearchDocument>,
  values: LoreSearchDocument[],
  staleRefs: string[],
  session: ClientSession,
): Promise<void> {
  if (values.length > 0) {
    const result = await collection.bulkWrite(
      values.map((value) => {
        const { createdAt, ...setFields } = value;
        return {
          updateOne: {
            filter: {
              entityRef: value.entityRef,
              projectionOwner: DOMAIN_SEARCH_PROJECTION_OWNER,
            },
            update: { $set: setFields, $setOnInsert: { createdAt } },
            upsert: true,
          },
        };
      }),
      { ordered: true, session },
    );
    if (result.matchedCount + result.upsertedCount !== values.length) {
      throw new Error(
        `search projection CAS 실패: expected=${values.length} actual=${result.matchedCount + result.upsertedCount}`,
      );
    }
  }
  if (staleRefs.length > 0) {
    const result = await collection.deleteMany(
      {
        entityRef: { $in: staleRefs as never[] },
        projectionOwner: DOMAIN_SEARCH_PROJECTION_OWNER,
      },
      { session },
    );
    if (result.deletedCount !== staleRefs.length) {
      throw new Error(
        `stale search projection 삭제 불일치: expected=${staleRefs.length} actual=${result.deletedCount}`,
      );
    }
  }
}

function ingestionStats(plan: RebuildPlan, warningCount = 0) {
  const written = planWriteCount(plan);
  const skipped =
    plan.sourceUnchanged +
    plan.aliases.unchanged +
    plan.edges.unchanged +
    plan.claims.unchanged +
    plan.searchUnchanged;
  const discovered = written + skipped + warningCount;
  return {
    discovered,
    processed: discovered,
    written,
    skipped,
    blocked: warningCount,
    failed: 0,
  };
}

async function executePlan(
  client: MongoClient,
  db: Db,
  preflight: RebuildState,
): Promise<{ runId: string; committed: RebuildState }> {
  const { plan, manifest } = preflight;
  const ingestionCollection = db.collection<LoreIngestionRun>(
    "lore_ingestion_runs",
  );
  const now = new Date();
  await ensureDurableSource(db, manifest);
  const run = loreIngestionRunSchema.parse({
    runId: `search-rebuild:${randomUUID()}`,
    mode: "search-rebuild",
    status: "running",
    dryRun: false,
    sourceIds: [manifest.sourceId],
    manifestHash: manifest.contentHash,
    parserVersion: "lore-index-v1",
    stats: {
      discovered: ingestionStats(plan, preflight.bundle.warnings.length).discovered,
      processed: 0,
      written: 0,
      skipped: 0,
      blocked: 0,
      failed: 0,
    },
    errors: [],
    startedAt: now,
    ...ingestionLeaseFields(now),
    createdAt: now,
    updatedAt: now,
  }) as LoreIngestionRun;
  await ingestionCollection.insertOne(run);

  const session = client.startSession();
  let committed: RebuildState | null = null;
  let attemptedManifest = manifest;
  try {
    committed =
      (await session.withTransaction(
      async () => {
        const snapshot = await loadSnapshot(db, session);
        await lockSnapshotVersions(db, snapshot, session, run.runId);
        const bundle = buildLoreProjection(snapshot);
        const transactionManifest = manifestSource(bundle);
        attemptedManifest = transactionManifest;
        const transactionPlan = await buildRebuildPlan(
          db,
          bundle,
          transactionManifest,
          session,
        );
        if (transactionPlan.conflicts.length > 0) {
          throw new Error(
            `[lore-rebuild] transaction conflict: ${transactionPlan.conflicts.join("; ")}`,
          );
        }
        const transactionState: RebuildState = {
          snapshot,
          bundle,
          manifest: transactionManifest,
          plan: transactionPlan,
        };

        await insertSources(
          db.collection<LoreSource>("lore_sources"),
          transactionPlan.sourceInserts,
          session,
        );
        await applyAssertionPlan(
          db.collection<LoreAlias>("lore_aliases"),
          transactionPlan.aliases,
          "aliasId",
          session,
        );
        await applyAssertionPlan(
          db.collection<LoreEdge>("lore_edges"),
          transactionPlan.edges,
          "edgeId",
          session,
        );
        await applyAssertionPlan(
          db.collection<LoreClaim>("lore_claims"),
          transactionPlan.claims,
          "claimId",
          session,
        );
        await putSearchDocuments(
          db.collection<LoreSearchDocument>("lore_search_documents"),
          transactionPlan.searchUpserts,
          transactionPlan.staleSearchRefs,
          session,
        );
        await releaseSnapshotLocks(db, snapshot, session, run.runId);
        return transactionState;
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      },
      )) ?? null;
    if (!committed) {
      throw new Error(`transaction commit state 누락: ${run.runId}`);
    }
    const committedState = committed;
    // Snapshot transaction은 기존 행의 version을 잠그지만 새 domain row의 phantom
    // insert까지 막을 수 없다. 커밋 후 새 snapshot을 재수집해 일치할 때만 성공으로
    // 승격한다. 불일치 run은 partial이라 consumer freshness gate가 사용하지 않는다.
    const freshSnapshot = await loadSnapshot(db);
    const freshManifest = manifestSource(buildLoreProjection(freshSnapshot));
    const completedAt = new Date();
    if (freshManifest.contentHash !== committedState.manifest.contentHash) {
      const partialStats = ingestionStats(
        committedState.plan,
        committedState.bundle.warnings.length,
      );
      await ingestionCollection.updateOne(
        { runId: run.runId, status: "running" },
        {
          $set: {
            status: "partial",
            sourceIds: [committedState.manifest.sourceId],
            manifestHash: committedState.manifest.contentHash,
            stats: {
              ...partialStats,
              discovered: partialStats.discovered + 1,
              processed: partialStats.processed + 1,
              blocked: partialStats.blocked + 1,
            },
            errors: [
              {
                code: "SOURCE_CHANGED_DURING_REBUILD",
                message: "projection 커밋 직후 domain manifest가 달라 성공 승격을 중단했습니다.",
                sourceId: committedState.manifest.sourceId,
              },
              ...committedState.bundle.warnings.slice(0, 999).map((warning) => ({
                code: "UNRESOLVED_GRAPH_REFERENCE",
                message: warning.slice(0, 2_000),
                sourceId: committedState.manifest.sourceId,
              })),
            ],
            completedAt,
            heartbeatAt: completedAt,
            updatedAt: completedAt,
          },
          $unset: { leaseExpiresAt: "" },
        },
      );
      throw new Error("[lore-rebuild] domain phantom 변경 감지: partial run으로 종료");
    }
    if (committedState.bundle.warnings.length > 0) {
      const warningErrors = committedState.bundle.warnings.slice(0, 1_000).map(
        (warning) => ({
          code: "UNRESOLVED_GRAPH_REFERENCE",
          message: warning.slice(0, 2_000),
          sourceId: committedState.manifest.sourceId,
        }),
      );
      const partial = await ingestionCollection.updateOne(
        { runId: run.runId, status: "running" },
        {
          $set: {
            status: "partial",
            sourceIds: [committedState.manifest.sourceId],
            manifestHash: committedState.manifest.contentHash,
            stats: ingestionStats(
              committedState.plan,
              committedState.bundle.warnings.length,
            ),
            errors: warningErrors,
            completedAt,
            heartbeatAt: completedAt,
            updatedAt: completedAt,
          },
          $unset: { leaseExpiresAt: "" },
        },
      );
      if (partial.matchedCount !== 1) {
        throw new Error(`ingestion run partial CAS 실패: ${run.runId}`);
      }
      throw new Error(
        `[lore-rebuild] unresolved graph reference ${committedState.bundle.warnings.length}건: partial run으로 종료`,
      );
    }
    const success = await ingestionCollection.updateOne(
      { runId: run.runId, status: "running" },
      {
        $set: {
          status: "succeeded",
          sourceIds: [committedState.manifest.sourceId],
          manifestHash: committedState.manifest.contentHash,
          stats: ingestionStats(committedState.plan, 0),
          completedAt,
          heartbeatAt: completedAt,
          updatedAt: completedAt,
        },
        $unset: { leaseExpiresAt: "" },
      },
    );
    if (success.matchedCount !== 1) {
      throw new Error(`ingestion run success CAS 실패: ${run.runId}`);
    }
    const saved = await ingestionCollection.findOne({ runId: run.runId });
    if (!saved) throw new Error(`ingestion run 재조회 실패: ${run.runId}`);
    loreIngestionRunSchema.parse(withoutId(saved));
    return { runId: run.runId, committed: committedState };
  } catch (error) {
    const completedAt = new Date();
    let message = error instanceof Error ? error.message : String(error);
    let failureSource = attemptedManifest;
    try {
      await ensureDurableSource(db, failureSource);
    } catch (sourceError) {
      failureSource = manifest;
      message = `${message}; attempted source 보존 실패: ${sourceError instanceof Error ? sourceError.message : String(sourceError)}`;
    }
    await ingestionCollection.updateOne(
      { runId: run.runId, status: "running" },
      {
        $set: {
          status: "failed",
          stats: {
            discovered: ingestionStats(plan, preflight.bundle.warnings.length).discovered,
            processed: 1,
            written: 0,
            skipped: 0,
            blocked: 0,
            failed: 1,
          },
          sourceIds: [failureSource.sourceId],
          manifestHash: failureSource.contentHash,
          errors: [
            {
              code: "LORE_SEARCH_REBUILD_FAILED",
              message: message.slice(0, 2_000),
              sourceId: failureSource.sourceId,
            },
          ],
          completedAt,
          heartbeatAt: completedAt,
          updatedAt: completedAt,
        },
        $unset: { leaseExpiresAt: "" },
      },
    );
    throw error;
  } finally {
    await session.endSession();
  }
}

async function main(): Promise<void> {
  if (!MONGODB_URI) {
    throw new Error("[lore-rebuild] MONGODB_URI가 필요합니다.");
  }
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  try {
    console.log(`[lore-rebuild] target host=${TARGET_HOST} db=${DB_NAME}`);
    const db = client.db(DB_NAME);
    const preflight = await loadRebuildState(db);
    printPlan(preflight.snapshot, preflight.bundle, preflight.plan);
    if (preflight.plan.conflicts.length > 0) {
      throw new Error("[lore-rebuild] conflict를 해결하기 전에는 실행할 수 없습니다.");
    }
    if (!EXECUTE) return;
    await assertLoreIndexesReady(db);
    const reconciledRuns = await reconcileExpiredIngestionRuns(
      db.collection<Document>("lore_ingestion_runs"),
      "search-rebuild",
    );
    if (reconciledRuns > 0) {
      console.warn(`[lore-rebuild] expired running audit ${reconciledRuns}건을 failed로 정리했습니다.`);
    }
    const { runId, committed } = await executePlan(client, db, preflight);
    if (committed.manifest.contentHash !== preflight.manifest.contentHash) {
      console.warn(
        "[lore-rebuild] preflight 뒤 원본 변경을 감지해 transaction snapshot 기준으로 재계획했습니다.",
      );
      printPlan(committed.snapshot, committed.bundle, committed.plan);
    }
    console.log(`[lore-rebuild] 완료 | run=${runId}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[lore-rebuild] 실패:", error);
  process.exitCode = 1;
});
