/**
 * Lore auxiliary index + session report identity + lossless seed compatibility
 * preflight/migration.
 *
 * Default mode is strictly read-only. Live DDL requires both flags and separate
 * operational approval:
 *   pnpm run lore:storage -- --execute --yes \
 *     --expected-plan-digest <read-only executionPlanDigest>
 */

import { createHash } from "node:crypto";
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
  IndexDescriptionInfo,
} from "mongodb";

import {
  indexDefinitionIssues,
  sameIndexKey,
} from "./lib/lore-index-inspection.ts";
import {
  auditLoreSourceIntegrity,
  type LoreSourceIdentity,
  type LoreSourceReference,
} from "./lib/lore-source-integrity.ts";
import {
  applySeedCompatibilityRepairsInSession,
  planCharacterNestedDateRepair,
  planMasterItemNullableManagedRepair,
  seedCompatibilityRepairDigest,
  seedCompatibilityRepairPostconditionIssues,
  seedCompatibilityRepairSignature,
  type SeedCompatibilityRepair,
} from "./lib/lore-seed-compatibility.ts";
import {
  guardDataTransactionOutcome,
  observeInReadOnlySnapshot,
  reconcileDataTransactionCommit,
  runLoreStorageExecutionPhases,
} from "./lib/lore-storage-execution.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const EXPECTED_PLAN_DIGEST = (() => {
  const index = process.argv.indexOf("--expected-plan-digest");
  return index >= 0 ? (process.argv[index + 1] ?? "").trim().toLowerCase() : "";
})();
const SESSION_REPORT_UNIQUE_INDEX = "session_reports_sessionId_unique";
const DOMAIN_PROJECTION_OWNER = "domain-ssot-v1";

if (EXECUTE && !YES) {
  throw new Error("[lore-storage] --execute에는 --yes 확인이 필요합니다.");
}
if (EXECUTE && !/^[a-f0-9]{64}$/u.test(EXPECTED_PLAN_DIGEST)) {
  throw new Error(
    "[lore-storage] --execute에는 read-only 출력의 --expected-plan-digest가 필요합니다.",
  );
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
  seedCompatibility: SeedCompatibilityInspection;
  seedCompatibilityRepairs: SeedCompatibilityRepair[];
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

interface SeedCompatibilityIssue {
  key: string;
  fields: string[];
}

interface SeedCompatibilityInspection {
  characterNestedDateRows: number;
  characterNestedDateKeys: string[];
  characterRequiredFieldRows: number;
  characterRequiredFieldIssues: SeedCompatibilityIssue[];
  masterItemNullableManagedRows: number;
  masterItemNullableManagedIssues: SeedCompatibilityIssue[];
  wikiMissingAuthorRows: number;
  wikiMissingAuthorIssues: SeedCompatibilityIssue[];
  sessionReportRequiredFieldRows: number;
  sessionReportRequiredFieldIssues: SeedCompatibilityIssue[];
  unrepairableAutomaticRows: string[];
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

function loreBackfillSignature(value: LoreBackfillInspection): string {
  return JSON.stringify({
    assertionUpdates: [...value.assertionUpdates].sort((left, right) =>
      `${left.collection}:${left.id}`.localeCompare(`${right.collection}:${right.id}`),
    ),
    searchOwnerEntityRefs: [...value.searchOwnerEntityRefs].sort(),
    invalidRows: [...value.invalidRows].sort(),
    duplicateActiveLogicalKeys: [...value.duplicateActiveLogicalKeys].sort(),
    unknownSearchOwners: [...value.unknownSearchOwners].sort(),
  });
}

async function writeLoreBackfill(
  db: Db,
  inspection: LoreBackfillInspection,
  session: ClientSession,
): Promise<void> {
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
}

const CHARACTER_NESTED_DATE_FILTER = {
  $or: [
    { "lore.relations.updatedAt": { $type: "date" } },
    { "lore.sessionAppearances.updatedAt": { $type: "date" } },
  ],
};

const CHARACTER_REQUIRED_FIELD_FILTER = {
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
};

const MASTER_ITEM_NULLABLE_MANAGED_FILTER = {
  $or: [
    { damage: { $type: "null" } },
    { authorId: { $type: "null" } },
    { authorName: { $type: "null" } },
  ],
};

const WIKI_MISSING_AUTHOR_FILTER = {
  $or: [
    { authorId: { $not: { $type: "string" } } },
    { authorId: /^\s*$/u },
    { authorName: { $not: { $type: "string" } } },
    { authorName: /^\s*$/u },
  ],
};

const SESSION_REPORT_REQUIRED_FIELD_FILTER = {
  $or: [
    { sessionTitle: { $not: { $type: "string" } } },
    { sessionTitle: /^\s*$/u },
    { summary: { $not: { $type: "string" } } },
    { highlights: { $not: { $type: "array" } } },
    { participants: { $not: { $type: "array" } } },
    { gmId: { $not: { $type: "string" } } },
    { gmName: { $not: { $type: "string" } } },
  ],
};

function valueAtPath(row: Document, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[part];
  }, row);
}

function issueKey(row: Document, field: string): string {
  return typeof row[field] === "string" && row[field].trim() !== ""
    ? row[field]
    : String(row._id ?? "<missing>");
}

function sortIssues(issues: SeedCompatibilityIssue[]): SeedCompatibilityIssue[] {
  return issues.sort((left, right) => left.key.localeCompare(right.key));
}

async function runInspectionOperations<T>(
  session: ClientSession | undefined,
  operations: Array<() => Promise<T>>,
): Promise<T[]> {
  if (!session) return Promise.all(operations.map((operation) => operation()));
  const results: T[] = [];
  // MongoDB transactions do not support parallel operations on one session.
  for (const operation of operations) results.push(await operation());
  return results;
}

async function inspectSeedCompatibility(
  db: Db,
  session?: ClientSession,
): Promise<{
  summary: SeedCompatibilityInspection;
  repairs: SeedCompatibilityRepair[];
}> {
  const [characterNestedRows, characterRequiredRows, masterItemRows, wikiRows, reportRows] =
    await runInspectionOperations<Document[]>(session, [
      () => db.collection("characters").find(CHARACTER_NESTED_DATE_FILTER, {
        projection: {
          codename: 1,
          updatedAt: 1,
          "lore.relations": 1,
          "lore.sessionAppearances": 1,
        },
        session,
      }).toArray(),
      () => db.collection("characters").find(CHARACTER_REQUIRED_FIELD_FILTER, {
        projection: {
          codename: 1,
          type: 1,
          role: 1,
          previewImage: 1,
          ownerId: 1,
          lore: 1,
        },
        session,
      }).toArray(),
      () => db.collection("master_items").find(MASTER_ITEM_NULLABLE_MANAGED_FILTER, {
        projection: { slug: 1, updatedAt: 1, damage: 1, authorId: 1, authorName: 1 },
        session,
      }).toArray(),
      () => db.collection("wiki_pages").find(WIKI_MISSING_AUTHOR_FILTER, {
        projection: { slug: 1, authorId: 1, authorName: 1 },
        session,
      }).toArray(),
      () => db.collection("session_reports").find(SESSION_REPORT_REQUIRED_FIELD_FILTER, {
        projection: {
          sessionId: 1,
          sessionTitle: 1,
          summary: 1,
          highlights: 1,
          participants: 1,
          gmId: 1,
          gmName: 1,
        },
        session,
      }).toArray(),
    ]);

  const repairs: SeedCompatibilityRepair[] = [];
  const unrepairableAutomaticRows: string[] = [];
  for (const row of characterNestedRows) {
    const key = issueKey(row, "codename");
    const repair = planCharacterNestedDateRepair(row);
    if (!repair) {
      unrepairableAutomaticRows.push(`characters:${key}:nested-date`);
      continue;
    }
    repairs.push({
      collection: "characters",
      id: row._id,
      key,
      expectedUpdatedAt: row.updatedAt,
      set: repair.set,
    });
  }
  for (const row of masterItemRows) {
    const key = issueKey(row, "slug");
    const repair = planMasterItemNullableManagedRepair(row);
    if (!repair) {
      unrepairableAutomaticRows.push(`master_items:${key}:nullable-managed`);
      continue;
    }
    repairs.push({
      collection: "master_items",
      id: row._id,
      key,
      expectedUpdatedAt: row.updatedAt,
      unsetFields: repair.unsetFields,
    });
  }

  const characterRequiredFields = [
    "role",
    "previewImage",
    "lore.name",
    "lore.gender",
    "lore.age",
    "lore.height",
    "lore.weight",
    "lore.appearance",
    "lore.personality",
    "lore.background",
    "lore.quote",
    "lore.mainImage",
  ];
  const characterRequiredFieldIssues = sortIssues(characterRequiredRows.map((row) => {
    const fields = characterRequiredFields.filter(
      (field) => typeof valueAtPath(row, field) !== "string",
    );
    if (row.type !== "AGENT" && row.type !== "NPC") fields.unshift("type");
    if (!Object.hasOwn(row, "ownerId")) fields.push("ownerId");
    return { key: issueKey(row, "codename"), fields };
  }));
  const masterItemNullableManagedIssues = sortIssues(masterItemRows.map((row) => ({
    key: issueKey(row, "slug"),
    fields: (["damage", "authorId", "authorName"] as const).filter(
      (field) => row[field] === null,
    ),
  })));
  const wikiMissingAuthorIssues = sortIssues(wikiRows.map((row) => ({
    key: issueKey(row, "slug"),
    fields: (["authorId", "authorName"] as const).filter(
      (field) => typeof row[field] !== "string" || row[field].trim() === "",
    ),
  })));
  const reportRequiredFields = [
    "sessionTitle",
    "summary",
    "highlights",
    "participants",
    "gmId",
    "gmName",
  ];
  const sessionReportRequiredFieldIssues = sortIssues(reportRows.map((row) => ({
    key: issueKey(row, "sessionId"),
    fields: reportRequiredFields.filter((field) => {
      const value = row[field];
      if (field === "highlights" || field === "participants") return !Array.isArray(value);
      if (field === "sessionTitle") return typeof value !== "string" || value.trim() === "";
      return typeof value !== "string";
    }),
  })));

  return {
    summary: {
      characterNestedDateRows: characterNestedRows.length,
      characterNestedDateKeys: characterNestedRows
        .map((row) => issueKey(row, "codename"))
        .sort(),
      characterRequiredFieldRows: characterRequiredRows.length,
      characterRequiredFieldIssues,
      masterItemNullableManagedRows: masterItemRows.length,
      masterItemNullableManagedIssues,
      wikiMissingAuthorRows: wikiRows.length,
      wikiMissingAuthorIssues,
      sessionReportRequiredFieldRows: reportRows.length,
      sessionReportRequiredFieldIssues,
      unrepairableAutomaticRows: unrepairableAutomaticRows.sort(),
    },
    repairs: repairs.sort((left, right) =>
      `${left.collection}:${left.key}`.localeCompare(`${right.collection}:${right.key}`),
    ),
  };
}

function storageDataPlanDigest(
  loreBackfill: LoreBackfillInspection,
  seedCompatibilityRepairs: SeedCompatibilityRepair[],
): string {
  return createHash("sha256")
    .update(loreBackfillSignature(loreBackfill))
    .update("\n")
    .update(seedCompatibilityRepairSignature(seedCompatibilityRepairs))
    .digest("hex");
}

interface AppliedStorageDataPlan {
  loreBackfill: LoreBackfillInspection;
  seedCompatibilityRepairs: SeedCompatibilityRepair[];
}

async function applyStorageDataPlan(
  db: Db,
  approvedLoreBackfill: LoreBackfillInspection,
  approvedSeedCompatibilityRepairs: SeedCompatibilityRepair[],
  expectedDataPlanDigest: string,
): Promise<AppliedStorageDataPlan> {
  if (
    storageDataPlanDigest(
      approvedLoreBackfill,
      approvedSeedCompatibilityRepairs,
    ) !== expectedDataPlanDigest
  ) {
    throw new Error("lore storage approved data plan digest가 일치하지 않습니다.");
  }

  const seedPlanDigest = seedCompatibilityRepairDigest(
    approvedSeedCompatibilityRepairs,
  );
  const session = (await getClient()).startSession();
  try {
    await guardDataTransactionOutcome((markMutationAttempted) =>
      session.withTransaction(async () => {
        // 모든 data plan을 첫 mutation 전에 같은 transaction snapshot에서 고정한다.
        const currentLoreBackfill = await inspectLoreBackfill(db, session);
        const currentSeedCompatibility = await inspectSeedCompatibility(db, session);
        if (
          storageDataPlanDigest(
            currentLoreBackfill,
            currentSeedCompatibility.repairs,
          ) !== expectedDataPlanDigest
        ) {
          throw new Error("lore storage data inspection/CAS snapshot이 변경되었습니다.");
        }

        const mutationCount =
          currentLoreBackfill.assertionUpdates.length +
          currentLoreBackfill.searchOwnerEntityRefs.length +
          currentSeedCompatibility.repairs.length;
        if (mutationCount > 0) markMutationAttempted();

        await writeLoreBackfill(db, currentLoreBackfill, session);
        await applySeedCompatibilityRepairsInSession(
          db,
          session,
          approvedSeedCompatibilityRepairs,
          seedPlanDigest,
          async (activeSession) =>
            (await inspectSeedCompatibility(db, activeSession)).repairs,
        );

        const afterLoreBackfill = await inspectLoreBackfill(db, session);
        if (
          afterLoreBackfill.assertionUpdates.length > 0 ||
          afterLoreBackfill.searchOwnerEntityRefs.length > 0 ||
          afterLoreBackfill.invalidRows.length > 0 ||
          afterLoreBackfill.duplicateActiveLogicalKeys.length > 0 ||
          afterLoreBackfill.unknownSearchOwners.length > 0
        ) {
          throw new Error("lore storage data transaction postflight가 실패했습니다.");
        }
      }),
    );
  } finally {
    await session.endSession();
  }

  return {
    loreBackfill: approvedLoreBackfill,
    seedCompatibilityRepairs: approvedSeedCompatibilityRepairs,
  };
}

interface StorageDataPostconditionVerification {
  state: "verified" | "mismatch" | "unavailable";
  issues: string[];
}

async function verifyStorageDataPlanPostconditions(
  db: Db,
  loreBackfill: LoreBackfillInspection,
  seedCompatibilityRepairs: SeedCompatibilityRepair[],
  session?: ClientSession,
): Promise<StorageDataPostconditionVerification> {
  const issues: string[] = [];
  try {
    for (const update of loreBackfill.assertionUpdates) {
      const rows = await db.collection(update.collection)
        .find(
          { [update.idField]: update.id },
          { projection: { logicalKey: 1 }, session },
        )
        .limit(2)
        .toArray();
      if (rows.length !== 1) {
        issues.push(`${update.collection}.${update.id}:target-count:${rows.length}`);
      } else if (rows[0].logicalKey !== update.logicalKey) {
        issues.push(`${update.collection}.${update.id}:logicalKey:mismatch`);
      }
    }
    for (const entityRef of loreBackfill.searchOwnerEntityRefs) {
      const rows = await db.collection("lore_search_documents")
        .find(
          { entityRef },
          { projection: { projectionOwner: 1 }, session },
        )
        .limit(2)
        .toArray();
      if (rows.length !== 1) {
        issues.push(`lore_search_documents.${entityRef}:target-count:${rows.length}`);
      } else if (rows[0].projectionOwner !== DOMAIN_PROJECTION_OWNER) {
        issues.push(`lore_search_documents.${entityRef}:projectionOwner:mismatch`);
      }
    }
    for (const repair of seedCompatibilityRepairs) {
      const projection: Document = { updatedAt: 1 };
      for (const field of Object.keys(repair.set ?? {})) projection[field] = 1;
      for (const field of repair.unsetFields ?? []) projection[field] = 1;
      const stored = await db.collection(repair.collection).findOne(
        { _id: repair.id },
        { projection, session },
      );
      issues.push(
        ...seedCompatibilityRepairPostconditionIssues(
          stored as Record<string, unknown> | null,
          repair,
        ),
      );
    }
  } catch (error) {
    return {
      state: "unavailable",
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
  return { state: issues.length === 0 ? "verified" : "mismatch", issues };
}

interface CommitUnknownDataObservation {
  state: "observed" | "unavailable";
  remainingDataPlanDigest: string | null;
  postconditions: StorageDataPostconditionVerification;
  error: string | null;
}

async function observeCommitUnknownDataState(
  db: Db,
  approvedLoreBackfill: LoreBackfillInspection,
  approvedSeedCompatibilityRepairs: SeedCompatibilityRepair[],
): Promise<CommitUnknownDataObservation> {
  const session = (await getClient()).startSession();
  try {
    return await observeInReadOnlySnapshot(
      (callback, options) => session.withTransaction(callback, options),
      async () => {
        // remaining plan과 exact target postcondition을 같은 snapshot에서 본다.
        const remainingLoreBackfill = await inspectLoreBackfill(db, session);
        const remainingSeedCompatibility = await inspectSeedCompatibility(
          db,
          session,
        );
        const postconditions = await verifyStorageDataPlanPostconditions(
          db,
          approvedLoreBackfill,
          approvedSeedCompatibilityRepairs,
          session,
        );
        return {
          state: "observed" as const,
          remainingDataPlanDigest: storageDataPlanDigest(
            remainingLoreBackfill,
            remainingSeedCompatibility.repairs,
          ),
          postconditions,
          error: null,
        };
      },
    );
  } catch (error) {
    return {
      state: "unavailable",
      remainingDataPlanDigest: null,
      postconditions: { state: "unavailable", issues: [] },
      error: error instanceof Error ? error.message : String(error),
    };
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
      const issues = actual ? indexDefinitionIssues(expected, actual) : [];
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

  const {
    summary: seedCompatibility,
    repairs: seedCompatibilityRepairs,
  } = await inspectSeedCompatibility(db);
  const seedCompatibilityCounts = {
    characterNestedDateRows: seedCompatibility.characterNestedDateRows,
    characterRequiredFieldRows: seedCompatibility.characterRequiredFieldRows,
    masterItemNullableManagedRows:
      seedCompatibility.masterItemNullableManagedRows,
    wikiMissingAuthorRows: seedCompatibility.wikiMissingAuthorRows,
    sessionReportRequiredFieldRows:
      seedCompatibility.sessionReportRequiredFieldRows,
  };
  for (const [kind, count] of Object.entries(seedCompatibilityCounts)) {
    if (count > 0) migrationGaps.push(`seed_compatibility_${kind}:${count}`);
  }
  if (seedCompatibility.unrepairableAutomaticRows.length > 0) {
    blockers.push(
      `unrepairable_seed_compatibility_rows:${seedCompatibility.unrepairableAutomaticRows.length}`,
    );
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
      const issues = actual ? indexDefinitionIssues(expected, actual) : [];
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
        ...(!sameIndexKey({ sessionId: 1 }, uniqueIndex.key) ? ["key"] : []),
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
    seedCompatibilityRepairs,
    ingestionRuns: {
      invalidRows: invalidIngestionRows,
      duplicateRunningModes,
      orphanSourceIds: orphanIngestionSourceIds,
    },
    sourceIntegrity,
    loreBackfill,
  };
}

interface StorageIndexPlanEntry {
  collection: string;
  name: string;
  state: "missing" | "invalid";
  issues: string[];
}

function storageIndexPlan(
  inspection: StorageInspection,
): StorageIndexPlanEntry[] {
  return [
    ...inspection.loreIndexes
      .filter((index) => index.state !== "valid")
      .map((index) => ({
        collection: index.collection,
        name: index.name,
        state: index.state,
        issues: [...index.issues].sort(),
      })),
    ...inspection.sessionReports.indexes
      .filter((index) => index.state !== "valid")
      .map((index) => ({
        collection: "session_reports",
        name: index.name,
        state: index.state,
        issues: [...index.issues].sort(),
      })),
  ].sort((left, right) =>
    `${left.collection}:${left.name}`.localeCompare(
      `${right.collection}:${right.name}`,
    ),
  ) as StorageIndexPlanEntry[];
}

function storageIndexPlanDigest(inspection: StorageInspection): string {
  return createHash("sha256")
    .update(JSON.stringify(storageIndexPlan(inspection)))
    .digest("hex");
}

function storageExecutionPlanDigest(
  dataPlanDigest: string,
  indexPlanDigest: string,
  target: { dbName: string; host: string },
): string {
  return createHash("sha256")
    .update(JSON.stringify({ dataPlanDigest, indexPlanDigest, target }))
    .digest("hex");
}

function summarizeSeedCompatibilityRepairs(
  repairs: SeedCompatibilityRepair[],
): Array<{
  collection: SeedCompatibilityRepair["collection"];
  id: string;
  key: string;
  expectedUpdatedAt: unknown;
  transformations: string[];
  sideEffect: string;
}> {
  return repairs.map((repair) => ({
    collection: repair.collection,
    id: String(repair.id),
    key: repair.key,
    expectedUpdatedAt: repair.expectedUpdatedAt === undefined
      ? { exists: false }
      : repair.expectedUpdatedAt,
    transformations: [
      ...Object.keys(repair.set ?? {}).map(
        (field) => `${field}: BSON Date -> ISO-8601 string`,
      ),
      ...(repair.unsetFields ?? []).map(
        (field) => `${field}: null -> absent`,
      ),
    ].sort(),
    sideEffect: "updatedAt -> execute timestamp",
  }));
}

function summarizeLoreBackfillMutations(
  inspection: LoreBackfillInspection,
): {
  assertionUpdates: LoreBackfillUpdate[];
  searchOwnerEntityRefs: string[];
} {
  return {
    assertionUpdates: [...inspection.assertionUpdates].sort((left, right) =>
      `${left.collection}:${left.id}`.localeCompare(`${right.collection}:${right.id}`),
    ),
    searchOwnerEntityRefs: [...inspection.searchOwnerEntityRefs].sort(),
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
  const approvedLoreBackfill = before.loreBackfill;
  const approvedSeedCompatibilityRepairs = before.seedCompatibilityRepairs;
  const seedCompatibilityPlanDigest = seedCompatibilityRepairDigest(
    approvedSeedCompatibilityRepairs,
  );
  const dataPlanDigest = storageDataPlanDigest(
    approvedLoreBackfill,
    approvedSeedCompatibilityRepairs,
  );
  const indexPlanDigest = storageIndexPlanDigest(before);
  const executionPlanDigest = storageExecutionPlanDigest(
    dataPlanDigest,
    indexPlanDigest,
    { dbName, host: targetHost },
  );
  const approvedIndexPlan = storageIndexPlan(before);
  const approvedIndexesByKey = new Map(
    approvedIndexPlan.map((index) => [
      `${index.collection}:${index.name}`,
      index,
    ]),
  );
  const ensuredIndexes: StorageIndexPlanEntry[] = [];
  const recordEnsuredIndex = (index: { collection: string; name: string }) => {
    const key = `${index.collection}:${index.name}`;
    const approved = approvedIndexesByKey.get(key);
    if (
      approved &&
      !ensuredIndexes.some(
        (entry) => `${entry.collection}:${entry.name}` === key,
      )
    ) {
      ensuredIndexes.push(approved);
    }
  };
  let lastSuccessfulInspection = before;
  const executionResult = EXECUTE
    ? await runLoreStorageExecutionPhases({
        applyDataPlan: async () => {
          if (executionPlanDigest !== EXPECTED_PLAN_DIGEST) {
            throw new Error(
              `[lore-storage] 승인된 execution plan digest가 현재 계획과 다릅니다: ${executionPlanDigest}`,
            );
          }
          if (before.blockers.length > 0) {
            throw new Error(
              `[lore-storage] blocker가 있어 실행하지 않습니다: ${before.blockers.join("; ")}`,
            );
          }
          return applyStorageDataPlan(
            db,
            approvedLoreBackfill,
            approvedSeedCompatibilityRepairs,
            dataPlanDigest,
          );
        },
        applyIndexDdl: async () => {
          const beforeDdl = await inspectStorage(db);
          lastSuccessfulInspection = beforeDdl;
          if (beforeDdl.blockers.length > 0) {
            throw new Error(
              `[lore-storage] data transaction 후 blocker: ${beforeDdl.blockers.join("; ")}`,
            );
          }
          if (
            beforeDdl.loreBackfill.assertionUpdates.length > 0 ||
            beforeDdl.loreBackfill.searchOwnerEntityRefs.length > 0 ||
            beforeDdl.seedCompatibilityRepairs.length > 0
          ) {
            throw new Error("[lore-storage] data transaction postflight 계획이 남았습니다.");
          }
          if (storageIndexPlanDigest(beforeDdl) !== indexPlanDigest) {
            throw new Error("[lore-storage] 승인된 index DDL plan이 변경되었습니다.");
          }
          await ensureLoreIndexes(db, { onEnsured: recordEnsuredIndex });
          await ensureSessionReportIndexes(db, {
            onEnsured: recordEnsuredIndex,
          });
          const afterDdl = await inspectStorage(db);
          lastSuccessfulInspection = afterDdl;
          const remainingIndexes = storageIndexPlan(afterDdl);
          if (remainingIndexes.length > 0) {
            throw new Error(
              `[lore-storage] index DDL postflight 대상이 남았습니다: ${remainingIndexes.length}`,
            );
          }
        },
      })
    : null;

  let postflightInspectionError: string | null = null;
  let after = before;
  if (EXECUTE) {
    try {
      after = await inspectStorage(db);
      lastSuccessfulInspection = after;
    } catch (error) {
      after = lastSuccessfulInspection;
      postflightInspectionError = error instanceof Error
        ? error.message
        : String(error);
    }
  }
  const approvedDataMutationCount =
    approvedLoreBackfill.assertionUpdates.length +
    approvedLoreBackfill.searchOwnerEntityRefs.length +
    approvedSeedCompatibilityRepairs.length;
  const commitUnknownDataObservation =
    executionResult?.dataTransaction === "unknown"
      ? await observeCommitUnknownDataState(
          db,
          approvedLoreBackfill,
          approvedSeedCompatibilityRepairs,
        )
      : {
          state: "unavailable" as const,
          remainingDataPlanDigest: null,
          postconditions: {
            state: "unavailable" as const,
            issues: [] as string[],
          },
          error: null,
        };
  const dataCommitReconciliation = reconcileDataTransactionCommit({
    dataTransaction: executionResult?.dataTransaction ?? "not-run",
    approvedMutationCount: approvedDataMutationCount,
    postReadAvailable: commitUnknownDataObservation.state === "observed",
    approvedDataPlanDigest: dataPlanDigest,
    remainingDataPlanDigest:
      commitUnknownDataObservation.remainingDataPlanDigest ?? "unavailable",
    postconditionState: commitUnknownDataObservation.postconditions.state,
  });
  const reconciledAppliedDataPlan = executionResult?.appliedDataPlan ??
    (dataCommitReconciliation === "state-consistent-with-commit"
      ? {
          loreBackfill: approvedLoreBackfill,
          seedCompatibilityRepairs: approvedSeedCompatibilityRepairs,
        }
      : null);
  const appliedDataPlanState = reconciledAppliedDataPlan
    ? "applied"
    : dataCommitReconciliation === "unknown"
      ? "unknown"
      : dataCommitReconciliation === "no-op"
        ? "no-op"
        : dataCommitReconciliation === "not-run"
          ? "not-run"
          : "not-applied";
  const remainingIndexPlan = storageIndexPlan(after);
  const remainingIndexKeys = new Set(
    remainingIndexPlan.map((index) => `${index.collection}:${index.name}`),
  );
  const indexesNoLongerPending = postflightInspectionError
    ? []
    : approvedIndexPlan.filter(
        (index) => !remainingIndexKeys.has(`${index.collection}:${index.name}`),
      );
  const pendingIndexes = after.loreIndexes.filter(
    (index) => index.state === "missing",
  ).length;
  const postBlockers = [...after.blockers];
  if (executionResult && executionResult.status !== "complete") {
    postBlockers.push(
      `lore_storage_execution_${executionResult.status}:${executionResult.error?.phase ?? "unknown"}`,
    );
  }
  if (postflightInspectionError) {
    postBlockers.push("lore_storage_postflight_inspection_failed");
  }
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
        executionPlanDigest,
        dataPlanDigest,
        indexPlanDigest,
        seedCompatibilityPlanDigest,
        seedCompatibilityAutomaticRepairs: summarizeSeedCompatibilityRepairs(
          approvedSeedCompatibilityRepairs,
        ),
        seedCompatibilityAppliedRepairs: summarizeSeedCompatibilityRepairs(
          reconciledAppliedDataPlan?.seedCompatibilityRepairs ?? [],
        ),
        seedCompatibilityAppliedState: dataCommitReconciliation,
        seedCompatibilityRemainingRepairs: summarizeSeedCompatibilityRepairs(
          after.seedCompatibilityRepairs,
        ),
        storageExecution: EXECUTE
          ? {
              status: executionResult!.status,
              dataTransaction: executionResult!.dataTransaction,
              indexDdl: executionResult!.indexDdl,
              error: executionResult!.error,
              postflightInspectionError,
              dataCommitReconciliation,
              commitUnknownDataObservation,
              approved: {
                loreBackfill: summarizeLoreBackfillMutations(
                  approvedLoreBackfill,
                ),
                seedCompatibility: summarizeSeedCompatibilityRepairs(
                  approvedSeedCompatibilityRepairs,
                ),
                indexes: approvedIndexPlan,
              },
              applied: {
                dataPlanState: appliedDataPlanState,
                loreBackfill: reconciledAppliedDataPlan
                  ? summarizeLoreBackfillMutations(
                      reconciledAppliedDataPlan.loreBackfill,
                    )
                  : null,
                seedCompatibility: reconciledAppliedDataPlan
                  ? summarizeSeedCompatibilityRepairs(
                      reconciledAppliedDataPlan.seedCompatibilityRepairs,
                    )
                  : null,
                indexes: ensuredIndexes,
                indexesNoLongerPending,
                indexAuditCompleteness: postflightInspectionError
                  ? "ensured-callbacks-only"
                  : "post-read-reconciled",
              },
              remaining: {
                observation: postflightInspectionError
                  ? "last-successful-inspection; current state unknown"
                  : "post-read-reconciled",
                loreBackfill: summarizeLoreBackfillMutations(after.loreBackfill),
                seedCompatibility: summarizeSeedCompatibilityRepairs(
                  after.seedCompatibilityRepairs,
                ),
                indexes: remainingIndexPlan,
              },
            }
          : {
              status: "read-only",
              approved: {
                loreBackfill: summarizeLoreBackfillMutations(
                  approvedLoreBackfill,
                ),
                seedCompatibility: summarizeSeedCompatibilityRepairs(
                  approvedSeedCompatibilityRepairs,
                ),
                indexes: approvedIndexPlan,
              },
            },
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
