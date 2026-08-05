/**
 * Lore auxiliary index + session report identity preflight/migration.
 *
 * Default mode is strictly read-only. Live DDL requires both flags and separate
 * operational approval:
 *   pnpm run lore:storage -- --execute --yes
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  close,
  ensureLoreIndexes,
  ensureSessionReportIndexes,
  findLoreUniqueIndexConflicts,
  getClient,
  getDb,
  initServerless,
  LORE_INDEX_DEFINITIONS,
  SESSION_REPORT_INDEX_DEFINITIONS,
} from "@stargate/shared-db";
import {
  buildLoreAliasLogicalKey,
  buildLoreClaimLogicalKey,
  buildLoreEdgeLogicalKey,
  loreAliasSchema,
  loreClaimSchema,
  loreEdgeSchema,
  loreIngestionRunSchema,
  loreSearchDocumentSchema,
  loreSourceDocumentSchema,
} from "@stargate/shared-db/schemas";
import type {
  ClientSession,
  Db,
  Document,
  IndexDescription,
  IndexDescriptionInfo,
} from "mongodb";

import {
  auditLoreSourceIntegrity,
  type LoreSourceIdentity,
  type LoreSourceReference,
} from "./lib/lore-source-integrity.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const SESSION_REPORT_UNIQUE_INDEX = "session_reports_sessionId_unique";
const DOMAIN_PROJECTION_OWNER = "domain-ssot-v1";

if (EXECUTE && !YES) {
  throw new Error("[lore-storage] --execute에는 --yes 확인이 필요합니다.");
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string): void {
  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    process.env[key] ??= normalizeEnvValue(trimmed.slice(separator + 1));
  }
}

function withDefaultUriOptions(
  rawUri: string,
  defaults: Record<string, string>,
): string {
  const [base, query = ""] = rawUri.split("?", 2);
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(defaults)) {
    if (!params.has(key)) params.set(key, value);
  }
  const nextQuery = params.toString();
  return nextQuery ? `${base}?${nextQuery}` : base;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function sameDocument(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function sameKey(expected: IndexDescription["key"], actual: Document): boolean {
  if (expected instanceof Map) {
    return sameDocument(Object.fromEntries(expected), actual);
  }
  return JSON.stringify(Object.entries(expected)) === JSON.stringify(Object.entries(actual));
}

function indexIssues(
  expected: IndexDescription,
  actual: IndexDescriptionInfo,
): string[] {
  const issues: string[] = [];
  if (!sameKey(expected.key, actual.key)) issues.push("key");
  if ((expected.unique === true) !== (actual.unique === true)) issues.push("unique");
  if ((expected.sparse === true) !== (actual.sparse === true)) issues.push("sparse");
  if (!sameDocument(expected.partialFilterExpression, actual.partialFilterExpression)) {
    issues.push("partialFilterExpression");
  }
  if (!sameDocument(expected.weights, actual.weights)) issues.push("weights");
  if (expected.default_language !== actual.default_language) {
    issues.push("default_language");
  }
  return issues;
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  return (await db.listCollections({ name }, { nameOnly: true }).hasNext()) === true;
}

async function listIndexes(db: Db, collection: string): Promise<IndexDescriptionInfo[]> {
  if (!(await collectionExists(db, collection))) return [];
  return db.collection(collection).listIndexes().toArray();
}

interface StorageInspection {
  blockers: string[];
  migrationGaps: string[];
  uniqueIndexConflicts: string[];
  loreIndexes: Array<{
    collection: string;
    name: string;
    state: "missing" | "valid" | "invalid";
    issues: string[];
  }>;
  sessionReports: {
    collectionExists: boolean;
    documentCount: number;
    invalidSessionIds: number;
    duplicateGroups: number;
    missingHistoricalProvenance: number;
    orphanProvenanceSources: number;
    uniqueIndexState: "missing" | "valid" | "invalid";
    uniqueIndexIssues: string[];
    indexes: Array<{
      name: string;
      state: "missing" | "valid" | "invalid";
      issues: string[];
    }>;
  };
  wikiVisibility: {
    collectionExists: boolean;
    nonBooleanIsPublic: number;
  };
  referenceLockMetadata: Array<{
    collection: "characters" | "master_items" | "wiki_pages";
    invalidLockTimestamps: number;
    legacyVersionRows: number;
  }>;
  seedCompatibility: {
    characterNestedDateRows: number;
    characterRequiredFieldRows: number;
    masterItemNullableManagedRows: number;
    wikiMissingAuthorRows: number;
    sessionReportRequiredFieldRows: number;
  };
  ingestionRuns: {
    invalidRows: string[];
    duplicateRunningModes: string[];
    orphanSourceIds: string[];
  };
  sourceIntegrity: {
    invalidRows: string[];
    duplicateSourceIds: string[];
    orphanReferences: string[];
    parentCycles: string[];
  };
  loreBackfill: LoreBackfillInspection;
}

interface LoreBackfillUpdate {
  collection: "lore_aliases" | "lore_edges" | "lore_claims";
  idField: "aliasId" | "edgeId" | "claimId";
  id: string;
  logicalKey: string;
}

interface LoreBackfillInspection {
  assertionUpdates: LoreBackfillUpdate[];
  searchOwnerEntityRefs: string[];
  invalidRows: string[];
  duplicateActiveLogicalKeys: string[];
  unknownSearchOwners: string[];
}

function withoutMongoId(row: Document): Document {
  const { _id, ...value } = row;
  void _id;
  return value;
}

function diagnosticId(row: Document, field: string): string {
  return typeof row[field] === "string" ? row[field] : String(row._id ?? "<missing>");
}

async function inspectLoreSourceIntegrity(
  db: Db,
): Promise<StorageInspection["sourceIntegrity"]> {
  const invalidRows: string[] = [];
  const sources: LoreSourceIdentity[] = [];
  const references: LoreSourceReference[] = [];

  if (await collectionExists(db, "lore_sources")) {
    for await (const row of db.collection("lore_sources").find({})) {
      const sourceId = diagnosticId(row, "sourceId");
      try {
        loreSourceDocumentSchema.parse(withoutMongoId(row));
      } catch (error) {
        invalidRows.push(
          `${sourceId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (typeof row.sourceId === "string") {
        sources.push({
          sourceId: row.sourceId,
          ...(typeof row.parentSourceId === "string"
            ? { parentSourceId: row.parentSourceId }
            : {}),
          ...(Array.isArray(row.parentSourceIds) &&
          row.parentSourceIds.every((value) => typeof value === "string")
            ? { parentSourceIds: row.parentSourceIds }
            : {}),
        });
      }
    }
  }

  const evidenceCollections = [
    { collection: "lore_aliases", idField: "aliasId" },
    { collection: "lore_edges", idField: "edgeId" },
    { collection: "lore_claims", idField: "claimId" },
  ] as const;
  for (const config of evidenceCollections) {
    if (!(await collectionExists(db, config.collection))) continue;
    for await (const row of db
      .collection(config.collection)
      .find({}, { projection: { [config.idField]: 1, evidence: 1 } })) {
      const ownerId = diagnosticId(row, config.idField);
      for (const evidence of Array.isArray(row.evidence) ? row.evidence : []) {
        if (
          evidence &&
          typeof evidence === "object" &&
          typeof evidence.sourceId === "string"
        ) {
          references.push({
            owner: `${config.collection}.${ownerId}.evidence`,
            sourceId: evidence.sourceId,
          });
        }
      }
    }
  }

  const arrayReferences = [
    {
      collection: "lore_search_documents",
      idField: "entityRef",
      sourceField: "sourceIds",
    },
    {
      collection: "lore_ingestion_runs",
      idField: "runId",
      sourceField: "sourceIds",
    },
  ] as const;
  for (const config of arrayReferences) {
    if (!(await collectionExists(db, config.collection))) continue;
    for await (const row of db.collection(config.collection).find(
      {},
      {
        projection: {
          [config.idField]: 1,
          [config.sourceField]: 1,
        },
      },
    )) {
      const ownerId = diagnosticId(row, config.idField);
      for (const sourceId of Array.isArray(row[config.sourceField])
        ? row[config.sourceField]
        : []) {
        if (typeof sourceId === "string") {
          references.push({
            owner: `${config.collection}.${ownerId}.${config.sourceField}`,
            sourceId,
          });
        }
      }
    }
  }

  return {
    invalidRows,
    ...auditLoreSourceIntegrity(sources, references),
  };
}

async function inspectLoreBackfill(
  db: Db,
  session?: ClientSession,
): Promise<LoreBackfillInspection> {
  const assertionUpdates: LoreBackfillUpdate[] = [];
  const invalidRows: string[] = [];
  const duplicateActiveLogicalKeys: string[] = [];
  const configs = [
    {
      collection: "lore_aliases" as const,
      idField: "aliasId" as const,
      logicalKey: buildLoreAliasLogicalKey,
      parse: loreAliasSchema,
    },
    {
      collection: "lore_edges" as const,
      idField: "edgeId" as const,
      logicalKey: buildLoreEdgeLogicalKey,
      parse: loreEdgeSchema,
    },
    {
      collection: "lore_claims" as const,
      idField: "claimId" as const,
      logicalKey: buildLoreClaimLogicalKey,
      parse: loreClaimSchema,
    },
  ];
  for (const config of configs) {
    if (!(await collectionExists(db, config.collection))) continue;
    const rows = await db.collection(config.collection).find({}, { session }).toArray();
    const activeCounts = new Map<string, number>();
    for (const row of rows) {
      const id = typeof row[config.idField] === "string" ? row[config.idField] : "<missing>";
      try {
        const logicalKey = config.logicalKey(row as never);
        config.parse.parse({ ...withoutMongoId(row), logicalKey });
        if (row.logicalKey !== logicalKey) {
          assertionUpdates.push({
            collection: config.collection,
            idField: config.idField,
            id,
            logicalKey,
          });
        }
        if (row.lineage?.state === "active") {
          activeCounts.set(logicalKey, (activeCounts.get(logicalKey) ?? 0) + 1);
        }
      } catch (error) {
        invalidRows.push(
          `${config.collection}.${id}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const [logicalKey, count] of activeCounts) {
      if (count > 1) {
        duplicateActiveLogicalKeys.push(`${config.collection}:${logicalKey}:${count}`);
      }
    }
  }

  const searchOwnerEntityRefs: string[] = [];
  const unknownSearchOwners: string[] = [];
  if (await collectionExists(db, "lore_search_documents")) {
    const rows = await db
      .collection("lore_search_documents")
      .find({}, { session })
      .toArray();
    for (const row of rows) {
      if (typeof row.projectionOwner === "string") {
        try {
          loreSearchDocumentSchema.parse(withoutMongoId(row));
        } catch (error) {
          invalidRows.push(
            `lore_search_documents.${String(row.entityRef)}:${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }
      const owned =
        Array.isArray(row.sourceIds) &&
        row.sourceIds.length > 0 &&
        row.sourceIds.every(
          (sourceId: unknown) =>
            typeof sourceId === "string" && sourceId.startsWith("idx-source:"),
        );
      if (!owned || typeof row.entityRef !== "string") {
        unknownSearchOwners.push(String(row.entityRef ?? row._id));
        continue;
      }
      try {
        loreSearchDocumentSchema.parse({
          ...withoutMongoId(row),
          projectionOwner: DOMAIN_PROJECTION_OWNER,
        });
        searchOwnerEntityRefs.push(row.entityRef);
      } catch (error) {
        invalidRows.push(
          `lore_search_documents.${row.entityRef}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return {
    assertionUpdates,
    searchOwnerEntityRefs,
    invalidRows,
    duplicateActiveLogicalKeys,
    unknownSearchOwners,
  };
}

async function applyLoreBackfill(db: Db, inspection: LoreBackfillInspection): Promise<void> {
  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const current = await inspectLoreBackfill(db, session);
      const signature = (value: LoreBackfillInspection) =>
        JSON.stringify({
          assertionUpdates: value.assertionUpdates,
          searchOwnerEntityRefs: [...value.searchOwnerEntityRefs].sort(),
          invalidRows: value.invalidRows,
          duplicateActiveLogicalKeys: value.duplicateActiveLogicalKeys,
          unknownSearchOwners: value.unknownSearchOwners,
        });
      if (signature(current) !== signature(inspection)) {
        throw new Error("lore backfill inspection/CAS snapshot이 변경되었습니다.");
      }
      for (const collection of ["lore_aliases", "lore_edges", "lore_claims"] as const) {
        const updates = inspection.assertionUpdates.filter(
          (update) => update.collection === collection,
        );
        if (updates.length === 0) continue;
        const result = await db.collection(collection).bulkWrite(
          updates.map((update) => ({
            updateOne: {
              filter: { [update.idField]: update.id },
              update: { $set: { logicalKey: update.logicalKey } },
            },
          })),
          { ordered: true, session },
        );
        if (result.matchedCount !== updates.length) {
          throw new Error(`${collection} logicalKey backfill CAS 불일치`);
        }
      }
      if (inspection.searchOwnerEntityRefs.length > 0) {
        const result = await db.collection("lore_search_documents").updateMany(
          {
            entityRef: { $in: inspection.searchOwnerEntityRefs },
            projectionOwner: { $exists: false },
          },
          { $set: { projectionOwner: DOMAIN_PROJECTION_OWNER } },
          { session },
        );
        if (result.modifiedCount !== inspection.searchOwnerEntityRefs.length) {
          throw new Error("search projectionOwner backfill CAS 불일치");
        }
      }
    });
  } finally {
    await session.endSession();
  }
}

async function inspectStorage(db: Db): Promise<StorageInspection> {
  const blockers: string[] = [];
  const migrationGaps: string[] = [];
  const uniqueIndexConflicts = await findLoreUniqueIndexConflicts(db);
  if (uniqueIndexConflicts.length > 0) {
    blockers.push(`lore_unique_index_conflicts:${uniqueIndexConflicts.length}`);
  }
  const sourceIntegrity = await inspectLoreSourceIntegrity(db);
  if (sourceIntegrity.invalidRows.length > 0) {
    blockers.push(`invalid_lore_sources:${sourceIntegrity.invalidRows.length}`);
  }
  if (sourceIntegrity.duplicateSourceIds.length > 0) {
    blockers.push(`duplicate_lore_source_ids:${sourceIntegrity.duplicateSourceIds.length}`);
  }
  if (sourceIntegrity.orphanReferences.length > 0) {
    blockers.push(`orphan_lore_source_references:${sourceIntegrity.orphanReferences.length}`);
  }
  if (sourceIntegrity.parentCycles.length > 0) {
    blockers.push(`lore_source_parent_cycles:${sourceIntegrity.parentCycles.length}`);
  }
  const loreIndexes: StorageInspection["loreIndexes"] = [];
  const loreBackfill = await inspectLoreBackfill(db);
  if (loreBackfill.invalidRows.length > 0) {
    blockers.push(`invalid_lore_rows:${loreBackfill.invalidRows.length}`);
  }
  if (loreBackfill.duplicateActiveLogicalKeys.length > 0) {
    blockers.push(
      `duplicate_active_lore_logical_keys:${loreBackfill.duplicateActiveLogicalKeys.length}`,
    );
  }
  if (loreBackfill.unknownSearchOwners.length > 0) {
    blockers.push(`unknown_search_projection_owners:${loreBackfill.unknownSearchOwners.length}`);
  }

  const invalidIngestionRows: string[] = [];
  const duplicateRunningModes: string[] = [];
  const orphanIngestionSourceIds: string[] = [];
  if (await collectionExists(db, "lore_ingestion_runs")) {
    const runs = await db.collection("lore_ingestion_runs").find({}).toArray();
    const referencedSourceIds = new Set<string>();
    const runningByMode = new Map<string, number>();
    for (const run of runs) {
      const runId = typeof run.runId === "string" ? run.runId : String(run._id);
      try {
        loreIngestionRunSchema.parse(withoutMongoId(run));
      } catch (error) {
        invalidIngestionRows.push(
          `${runId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
      for (const sourceId of Array.isArray(run.sourceIds) ? run.sourceIds : []) {
        if (typeof sourceId === "string") referencedSourceIds.add(sourceId);
      }
      if (run.status === "running" && typeof run.mode === "string") {
        runningByMode.set(run.mode, (runningByMode.get(run.mode) ?? 0) + 1);
      }
    }
    for (const [mode, count] of runningByMode) {
      if (count > 1) duplicateRunningModes.push(`${mode}:${count}`);
    }
    if (referencedSourceIds.size > 0) {
      const sourceIds = [...referencedSourceIds];
      const existing = await db
        .collection("lore_sources")
        .find({ sourceId: { $in: sourceIds } }, { projection: { sourceId: 1 } })
        .toArray();
      const existingIds = new Set(existing.map((source) => String(source.sourceId)));
      orphanIngestionSourceIds.push(
        ...sourceIds.filter((sourceId) => !existingIds.has(sourceId)),
      );
    }
  }
  if (invalidIngestionRows.length > 0) {
    blockers.push(`invalid_lore_ingestion_runs:${invalidIngestionRows.length}`);
  }
  if (duplicateRunningModes.length > 0) {
    blockers.push(`duplicate_running_ingestion_modes:${duplicateRunningModes.length}`);
  }
  if (orphanIngestionSourceIds.length > 0) {
    blockers.push(`orphan_ingestion_source_ids:${orphanIngestionSourceIds.length}`);
  }

  for (const [collection, expectedIndexes] of Object.entries(
    LORE_INDEX_DEFINITIONS,
  )) {
    const actualIndexes = await listIndexes(db, collection);
    for (const expected of expectedIndexes) {
      const actual = actualIndexes.find((index) => index.name === expected.name);
      const issues = actual ? indexIssues(expected, actual) : [];
      const state = !actual ? "missing" : issues.length > 0 ? "invalid" : "valid";
      loreIndexes.push({
        collection,
        name: String(expected.name),
        state,
        issues,
      });
      if (state === "invalid") {
        blockers.push(
          `invalid_lore_index:${collection}.${String(expected.name)}:${issues.join(",")}`,
        );
      }
    }

    const expectedTextName = expectedIndexes.find((index) =>
      Object.values(index.key instanceof Map ? Object.fromEntries(index.key) : index.key).includes(
        "text",
      ),
    )?.name;
    if (expectedTextName) {
      const unexpectedText = actualIndexes.find(
        (index) =>
          Object.values(index.key).includes("text") && index.name !== expectedTextName,
      );
      if (unexpectedText) {
        blockers.push(
          `unexpected_text_index:${collection}.${String(unexpectedText.name)}`,
        );
      }
    }
  }

  const reportsExist = await collectionExists(db, "session_reports");
  let documentCount = 0;
  let invalidSessionIds = 0;
  let duplicateGroups = 0;
  let missingHistoricalProvenance = 0;
  let orphanProvenanceSources = 0;
  let uniqueIndexState: StorageInspection["sessionReports"]["uniqueIndexState"] =
    "missing";
  let uniqueIndexIssues: string[] = [];
  let sessionReportIndexes: StorageInspection["sessionReports"]["indexes"] =
    SESSION_REPORT_INDEX_DEFINITIONS.map((index) => ({
      name: String(index.name),
      state: "missing",
      issues: [],
    }));
  const wikiExists = await collectionExists(db, "wiki_pages");
  const nonBooleanWikiVisibility = wikiExists
    ? await db.collection("wiki_pages").countDocuments({
        $expr: { $ne: [{ $type: "$isPublic" }, "bool"] },
      })
    : 0;
  if (nonBooleanWikiVisibility > 0) {
    blockers.push(`invalid_wiki_isPublic:${nonBooleanWikiVisibility}`);
  }

  const referenceLockMetadata: StorageInspection["referenceLockMetadata"] = [];
  for (const collection of [
    "characters",
    "master_items",
    "wiki_pages",
  ] as const) {
    const exists = await collectionExists(db, collection);
    const [invalidLockTimestamps, legacyVersionRows] = exists
      ? await Promise.all([
          db.collection(collection).countDocuments({
            __sessionReportReferenceLockAt: { $exists: true },
            $expr: {
              $ne: [
                { $type: "$__sessionReportReferenceLockAt" },
                "date",
              ],
            },
          }),
          db.collection(collection).countDocuments({
            __sessionReportReferenceVersion: { $exists: true },
          }),
        ])
      : [0, 0];
    referenceLockMetadata.push({
      collection,
      invalidLockTimestamps,
      legacyVersionRows,
    });
    if (invalidLockTimestamps > 0) {
      blockers.push(
        `invalid_report_reference_lock_timestamp:${collection}:${invalidLockTimestamps}`,
      );
    }
    if (legacyVersionRows > 0) {
      blockers.push(
        `legacy_report_reference_version:${collection}:${legacyVersionRows}`,
      );
    }
  }

  const characterExists = await collectionExists(db, "characters");
  const masterItemsExist = await collectionExists(db, "master_items");
  const [
    characterNestedDateRows,
    characterRequiredFieldRows,
    masterItemNullableManagedRows,
    wikiMissingAuthorRows,
    sessionReportRequiredFieldRows,
  ] = await Promise.all([
    characterExists
      ? db.collection("characters").countDocuments({
          $or: [
            { "lore.relations.updatedAt": { $type: "date" } },
            { "lore.sessionAppearances.updatedAt": { $type: "date" } },
          ],
        })
      : 0,
    characterExists
      ? db.collection("characters").countDocuments({
          $or: [
            { type: { $not: { $in: ["AGENT", "NPC"] } } },
            { role: { $not: { $type: "string" } } },
            { previewImage: { $not: { $type: "string" } } },
            { ownerId: { $exists: false } },
            { "lore.name": { $not: { $type: "string" } } },
            { "lore.gender": { $not: { $type: "string" } } },
            { "lore.age": { $not: { $type: "string" } } },
            { "lore.height": { $not: { $type: "string" } } },
            { "lore.weight": { $not: { $type: "string" } } },
            { "lore.appearance": { $not: { $type: "string" } } },
            { "lore.personality": { $not: { $type: "string" } } },
            { "lore.background": { $not: { $type: "string" } } },
            { "lore.quote": { $not: { $type: "string" } } },
            { "lore.mainImage": { $not: { $type: "string" } } },
          ],
        })
      : 0,
    masterItemsExist
      ? db.collection("master_items").countDocuments({
          $or: [
            { damage: { $type: "null" } },
            { authorId: { $type: "null" } },
            { authorName: { $type: "null" } },
          ],
        })
      : 0,
    wikiExists
      ? db.collection("wiki_pages").countDocuments({
          $or: [
            { authorId: { $not: { $type: "string" } } },
            { authorName: { $not: { $type: "string" } } },
          ],
        })
      : 0,
    reportsExist
      ? db.collection("session_reports").countDocuments({
          $or: [
            { sessionTitle: { $not: { $type: "string" } } },
            { summary: { $not: { $type: "string" } } },
            { highlights: { $not: { $type: "array" } } },
            { participants: { $not: { $type: "array" } } },
            { gmId: { $not: { $type: "string" } } },
            { gmName: { $not: { $type: "string" } } },
          ],
        })
      : 0,
  ]);
  const seedCompatibility = {
    characterNestedDateRows,
    characterRequiredFieldRows,
    masterItemNullableManagedRows,
    wikiMissingAuthorRows,
    sessionReportRequiredFieldRows,
  };
  for (const [kind, count] of Object.entries(seedCompatibility)) {
    if (count > 0) migrationGaps.push(`seed_compatibility_${kind}:${count}`);
  }

  if (reportsExist) {
    const reports = db.collection("session_reports");
    [documentCount, invalidSessionIds] = await Promise.all([
      reports.countDocuments({}),
      reports.countDocuments({
        $or: [
          { sessionId: { $exists: false } },
          { sessionId: { $not: { $type: "string" } } },
          { sessionId: /^\s*$/u },
        ],
      }),
    ]);
    const duplicateResult = await reports
      .aggregate<{ groups: number }>([
        { $group: { _id: "$sessionId", occurrences: { $sum: 1 } } },
        { $match: { occurrences: { $gt: 1 } } },
        { $count: "groups" },
      ])
      .next();
    duplicateGroups = duplicateResult?.groups ?? 0;

    missingHistoricalProvenance = await reports.countDocuments({
      sessionId: { $not: /^[a-f0-9]{24}$/iu },
      $or: [
        { provenanceSourceIds: { $exists: false } },
        { provenanceSourceIds: { $not: { $type: "array" } } },
        { provenanceSourceIds: { $size: 0 } },
      ],
    });
    const orphanProvenance = await reports
      .aggregate<{ count: number }>([
        {
          $match: {
            provenanceSourceIds: { $type: "array", $ne: [] },
          },
        },
        { $unwind: "$provenanceSourceIds" },
        {
          $match: {
            provenanceSourceIds: { $type: "string", $not: /^\s*$/u },
          },
        },
        {
          $lookup: {
            from: "lore_sources",
            localField: "provenanceSourceIds",
            foreignField: "sourceId",
            as: "provenanceSources",
          },
        },
        { $match: { provenanceSources: { $size: 0 } } },
        { $group: { _id: "$_id" } },
        { $count: "count" },
      ])
      .next();
    orphanProvenanceSources = orphanProvenance?.count ?? 0;

    const indexes = await listIndexes(db, "session_reports");
    sessionReportIndexes = SESSION_REPORT_INDEX_DEFINITIONS.map((expected) => {
      const actual = indexes.find((index) => index.name === expected.name);
      const issues = actual ? indexIssues(expected, actual) : [];
      const state = !actual ? "missing" : issues.length > 0 ? "invalid" : "valid";
      if (state === "invalid") {
        blockers.push(
          `invalid_session_report_index:${String(expected.name)}:${issues.join(",")}`,
        );
      }
      return { name: String(expected.name), state, issues };
    });
    const uniqueIndex = indexes.find(
      (index) => index.name === SESSION_REPORT_UNIQUE_INDEX,
    );
    if (uniqueIndex) {
      uniqueIndexIssues = [
        ...(!sameKey({ sessionId: 1 }, uniqueIndex.key) ? ["key"] : []),
        ...(uniqueIndex.unique === true ? [] : ["unique"]),
        ...(uniqueIndex.sparse === true ? ["sparse"] : []),
      ];
      uniqueIndexState = uniqueIndexIssues.length > 0 ? "invalid" : "valid";
    }

    if (invalidSessionIds > 0) {
      blockers.push(`invalid_session_report_ids:${invalidSessionIds}`);
    }
    if (duplicateGroups > 0) {
      blockers.push(`duplicate_session_report_ids:${duplicateGroups}`);
    }
    if (missingHistoricalProvenance > 0) {
      migrationGaps.push(
        `missing_historical_report_provenance:${missingHistoricalProvenance}`,
      );
    }
    if (orphanProvenanceSources > 0) {
      migrationGaps.push(
        `orphan_report_provenance_sources:${orphanProvenanceSources}`,
      );
    }
    if (uniqueIndexState === "invalid") {
      blockers.push(
        `invalid_session_report_unique_index:${uniqueIndexIssues.join(",")}`,
      );
    }
  }

  return {
    blockers,
    migrationGaps,
    uniqueIndexConflicts,
    loreIndexes,
    sessionReports: {
      collectionExists: reportsExist,
      documentCount,
      invalidSessionIds,
      duplicateGroups,
      missingHistoricalProvenance,
      orphanProvenanceSources,
      uniqueIndexState,
      uniqueIndexIssues,
      indexes: sessionReportIndexes,
    },
    wikiVisibility: {
      collectionExists: wikiExists,
      nonBooleanIsPublic: nonBooleanWikiVisibility,
    },
    referenceLockMetadata,
    seedCompatibility,
    ingestionRuns: {
      invalidRows: invalidIngestionRows,
      duplicateRunningModes,
      orphanSourceIds: orphanIngestionSourceIds,
    },
    sourceIntegrity,
    loreBackfill,
  };
}

loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

const rawUri = process.env.MONGODB_URI;
if (
  process.env.DB_NAME &&
  process.env.MONGODB_DB_NAME &&
  process.env.DB_NAME !== process.env.MONGODB_DB_NAME
) {
  throw new Error(
    `[lore-storage] DB_NAME(${process.env.DB_NAME})과 MONGODB_DB_NAME(${process.env.MONGODB_DB_NAME})이 다릅니다.`,
  );
}
const dbName = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";
if (EXECUTE && !process.env.DB_NAME && !process.env.MONGODB_DB_NAME) {
  throw new Error("[lore-storage] WRITE에는 DB_NAME 또는 MONGODB_DB_NAME을 명시해야 합니다.");
}
if (!rawUri) throw new Error("MONGODB_URI is required.");
const targetHost = (() => {
  try {
    return new URL(rawUri).host;
  } catch {
    return "unparseable";
  }
})();

initServerless({
  uri: withDefaultUriOptions(rawUri, {
    connectTimeoutMS: "15000",
    serverSelectionTimeoutMS: "15000",
  }),
  dbName,
  maxPoolSize: 5,
});

try {
  const db = await getDb();
  const before = await inspectStorage(db);
  if (EXECUTE) {
    if (before.blockers.length > 0) {
      throw new Error(
        `[lore-storage] blocker가 있어 실행하지 않습니다: ${before.blockers.join("; ")}`,
      );
    }
    await applyLoreBackfill(db, before.loreBackfill);
    const afterBackfill = await inspectStorage(db);
    if (afterBackfill.blockers.length > 0) {
      throw new Error(
        `[lore-storage] backfill 후 blocker: ${afterBackfill.blockers.join("; ")}`,
      );
    }
    await ensureLoreIndexes(db);
    await ensureSessionReportIndexes(db);
  }

  const after = EXECUTE ? await inspectStorage(db) : before;
  const pendingIndexes = after.loreIndexes.filter(
    (index) => index.state === "missing",
  ).length;
  const postBlockers = [...after.blockers];
  if (EXECUTE && pendingIndexes > 0) {
    postBlockers.push(`missing_lore_indexes_after_execute:${pendingIndexes}`);
  }
  if (EXECUTE && after.sessionReports.uniqueIndexState !== "valid") {
    postBlockers.push(
      `session_report_unique_index_after_execute:${after.sessionReports.uniqueIndexState}`,
    );
  }
  const pendingSessionReportIndexes = after.sessionReports.indexes.filter(
    (index) => index.state === "missing",
  ).length;
  if (EXECUTE && pendingSessionReportIndexes > 0) {
    postBlockers.push(
      `missing_session_report_indexes_after_execute:${pendingSessionReportIndexes}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "read-only",
        checkedAt: new Date().toISOString(),
        targetHost,
        dbName,
        expectedLoreIndexes: after.loreIndexes.length,
        validLoreIndexes: after.loreIndexes.filter(
          (index) => index.state === "valid",
        ).length,
        missingLoreIndexes: pendingIndexes,
        invalidLoreIndexes: after.loreIndexes.filter(
          (index) => index.state === "invalid",
        ),
        sessionReports: after.sessionReports,
        wikiVisibility: after.wikiVisibility,
        referenceLockMetadata: after.referenceLockMetadata,
        seedCompatibility: after.seedCompatibility,
        ingestionRuns: after.ingestionRuns,
        sourceIntegrity: after.sourceIntegrity,
        uniqueIndexConflicts: after.uniqueIndexConflicts,
        loreBackfill: {
          assertionUpdates: after.loreBackfill.assertionUpdates.length,
          searchOwnerUpdates: after.loreBackfill.searchOwnerEntityRefs.length,
          invalidRows: after.loreBackfill.invalidRows,
          duplicateActiveLogicalKeys:
            after.loreBackfill.duplicateActiveLogicalKeys,
          unknownSearchOwners: after.loreBackfill.unknownSearchOwners,
        },
        blockers: postBlockers,
        migrationGaps: after.migrationGaps,
      },
      null,
      2,
    ),
  );
  if (postBlockers.length > 0) process.exitCode = 2;
} finally {
  const client = await getClient().catch(() => null);
  await client?.close();
  await close();
}
