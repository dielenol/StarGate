/**
 * Historical session_reports provenance 전용 backfill.
 *
 * 기본은 read-only 계획이다. Domain/economy payload를 재실행하지 않고 seed
 * repository source 문서와 report의 add-only provenance ledger만 원자적으로 쓴다.
 * Live 실행은 별도 운영 승인 뒤 두 플래그를 모두 요구한다.
 *
 *   pnpm lore:provenance
 *   pnpm lore:provenance -- --execute --yes
 */

import { isDeepStrictEqual } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LORE_INDEX_DEFINITIONS,
  SESSION_REPORT_INDEX_DEFINITIONS,
} from "@stargate/shared-db";
import {
  loreSourceDocumentSchema,
  validateSeedStoredDocument,
} from "@stargate/shared-db/schemas";
import {
  MongoClient,
  type Db,
  type Document,
  type IndexDescription,
  type IndexDescriptionInfo,
} from "mongodb";

import {
  buildReportProvenanceUpdate,
  currentProvenanceLedger,
  immutableLoreSourcePayload,
  parseStoredLoreSource,
} from "./lib/report-provenance-backfill.ts";
import {
  inspectCommittedRepositorySource,
  type CommittedRepositorySource,
} from "./lib/repository-source.ts";
import {
  historicalReportSessionIds,
  seedManifestHash,
  seedPayloadSourceId,
} from "./lib/seed-provenance.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");

if (EXECUTE && !YES) {
  throw new Error("[report-provenance] --execute에는 --yes 확인이 필요합니다.");
}

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return quote && (quote === '"' || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

function loadEnvFile(path: string): void {
  let source = "";
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    process.env[key] ??= normalizeEnvValue(trimmed.slice(separator + 1));
  }
}

function collectJsonFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return collectJsonFiles(path);
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    })
    .sort();
}

interface SourcePlan {
  file: string;
  sourceId: string;
  manifestHash: string;
  repositorySource?: CommittedRepositorySource;
  repositoryIssues: string[];
}

interface ReportPlan {
  sessionId: string;
  sourceIds: string[];
}

function buildPlans(payloadRoot: string): {
  sources: SourcePlan[];
  reports: ReportPlan[];
} {
  const sources = new Map<string, SourcePlan>();
  const reportSources = new Map<string, Set<string>>();
  for (const file of collectJsonFiles(payloadRoot)) {
    const repositoryInspection = inspectCommittedRepositorySource(file, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    const sourceText = repositoryInspection.content.toString("utf8");
    const sessionIds = historicalReportSessionIds(sourceText);
    if (sessionIds.length === 0) continue;
    const manifestHash = seedManifestHash(sourceText);
    const sourceId = seedPayloadSourceId(file, manifestHash, projectRoot);
    sources.set(sourceId, {
      file,
      sourceId,
      manifestHash,
      repositorySource: repositoryInspection.source,
      repositoryIssues: repositoryInspection.issues,
    });
    for (const sessionId of sessionIds) {
      const ids = reportSources.get(sessionId) ?? new Set<string>();
      ids.add(sourceId);
      reportSources.set(sessionId, ids);
    }
  }
  return {
    sources: [...sources.values()].sort((left, right) =>
      left.sourceId.localeCompare(right.sourceId),
    ),
    reports: [...reportSources]
      .map(([sessionId, sourceIds]) => ({
        sessionId,
        sourceIds: [...sourceIds].sort(),
      }))
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
  };
}

function sourceDocument(plan: SourcePlan, now: Date): Document {
  if (!plan.repositorySource) {
    throw new Error(
      `repository source is not immutable: ${relative(projectRoot, plan.file)} (${plan.repositoryIssues.join(", ")})`,
    );
  }
  return loreSourceDocumentSchema.parse({
    sourceId: plan.sourceId,
    kind: "repository-document",
    title: basename(plan.file),
    locator: {
      kind: "repository-path",
      value: plan.repositorySource.projectPath,
      anchor: `git:${plan.repositorySource.commitSha}`,
    },
    contentHash: plan.manifestHash,
    access: { visibility: "gm-only" },
    capturedAt: plan.repositorySource.committedAt,
    createdAt: now,
    updatedAt: now,
  });
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

function sameIndexKey(expected: IndexDescription["key"], actual: Document): boolean {
  const expectedEntries = expected instanceof Map
    ? [...expected.entries()]
    : Object.entries(expected);
  return JSON.stringify(expectedEntries) === JSON.stringify(Object.entries(actual));
}

function indexContractIssues(
  expected: IndexDescription,
  actual: IndexDescriptionInfo,
): string[] {
  const issues: string[] = [];
  if (!sameIndexKey(expected.key, actual.key)) issues.push("key");
  if ((expected.unique === true) !== (actual.unique === true)) issues.push("unique");
  if ((expected.sparse === true) !== (actual.sparse === true)) issues.push("sparse");
  if (!sameDocument(expected.partialFilterExpression, actual.partialFilterExpression)) {
    issues.push("partialFilterExpression");
  }
  return issues;
}

function requiredUniqueIndexes(): Array<{
  collection: string;
  expected: IndexDescription;
}> {
  const source = LORE_INDEX_DEFINITIONS.lore_sources?.find(
    (index) => index.name === "lore_sources_sourceId_unique",
  );
  const report = SESSION_REPORT_INDEX_DEFINITIONS.find(
    (index) => index.name === "session_reports_sessionId_unique",
  );
  if (!source || !report) {
    throw new Error("required provenance index definitions are unavailable");
  }
  return [
    { collection: "lore_sources", expected: source },
    { collection: "session_reports", expected: report },
  ];
}

async function uniqueIndexIssues(db: Db): Promise<{
  contracts: string[];
  duplicates: string[];
}> {
  const contracts: string[] = [];
  const duplicates: string[] = [];
  for (const { collection, expected } of requiredUniqueIndexes()) {
    const name = String(expected.name);
    const exists = await db
      .listCollections({ name: collection }, { nameOnly: true })
      .hasNext();
    const indexes = exists
      ? await db.collection(collection).listIndexes().toArray()
      : [];
    const actual = indexes.find((index) => index.name === name);
    if (!actual) {
      contracts.push(`${collection}.${name}:missing`);
    } else {
      const issues = indexContractIssues(expected, actual);
      if (issues.length > 0) {
        contracts.push(`${collection}.${name}:invalid:${issues.join("+")}`);
      }
    }

    if (!exists) continue;
    const key = expected.key instanceof Map
      ? Object.fromEntries(expected.key)
      : expected.key;
    const fields = Object.keys(key);
    const groupId = Object.fromEntries(
      fields.map((field, index) => [`key${index}`, `$${field}`]),
    );
    const hasDuplicate = await db.collection(collection).aggregate([
      ...(expected.partialFilterExpression
        ? [{ $match: expected.partialFilterExpression }]
        : []),
      { $group: { _id: groupId, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).hasNext();
    if (hasDuplicate) duplicates.push(`${collection}.${name}`);
  }
  return { contracts, duplicates };
}

async function inspect(db: Db, plans: ReturnType<typeof buildPlans>) {
  const reportRows = await db
    .collection("session_reports")
    .find({ sessionId: { $in: plans.reports.map((plan) => plan.sessionId) } })
    .toArray();
  const reportBySession = new Map(reportRows.map((row) => [row.sessionId, row]));
  const missingReports: string[] = [];
  const invalidLedgers: string[] = [];
  const invalidStoredReports: string[] = [];
  const reportUpdates: Array<{
    sessionId: string;
    currentCount: number;
    desiredCount: number;
    missingCount: number;
    removesLegacy: boolean;
    needsUpdate: boolean;
  }> = [];
  for (const plan of plans.reports) {
    const row = reportBySession.get(plan.sessionId);
    if (!row) {
      missingReports.push(plan.sessionId);
      continue;
    }
    try {
      validateSeedStoredDocument("session_reports", row);
    } catch (error) {
      invalidStoredReports.push(
        `${plan.sessionId}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const update = buildReportProvenanceUpdate(row, plan.sourceIds);
      reportUpdates.push({
        sessionId: plan.sessionId,
        currentCount: update.current.length,
        desiredCount: update.desired.length,
        missingCount: update.missingCount,
        removesLegacy: update.removesLegacy,
        needsUpdate: update.needsUpdate,
      });
    } catch (error) {
      invalidLedgers.push(
        `${plan.sessionId}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const sourceCollisions: string[] = [];
  const invalidStoredSources: string[] = [];
  for (const plan of plans.sources) {
    if (!plan.repositorySource) continue;
    const expected = sourceDocument(plan, new Date());
    const existing = await db.collection("lore_sources").findOne({ sourceId: plan.sourceId });
    if (existing) {
      try {
        const parsed = parseStoredLoreSource(existing);
        if (
          !isDeepStrictEqual(
            immutableLoreSourcePayload(parsed),
            immutableLoreSourcePayload(expected),
          )
        ) {
          sourceCollisions.push(plan.sourceId);
        }
      } catch (error) {
        invalidStoredSources.push(
          `${plan.sourceId}:${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  const repositorySourceIssues = plans.sources.flatMap((plan) =>
    plan.repositoryIssues.map(
      (issue) => `${relative(projectRoot, plan.file)}:${issue}`,
    ),
  );
  const uniqueIndexes = await uniqueIndexIssues(db);
  return {
    indexIssues: uniqueIndexes.contracts,
    duplicateUniqueKeys: uniqueIndexes.duplicates,
    repositorySourceIssues,
    missingReports,
    invalidLedgers,
    invalidStoredReports,
    invalidStoredSources,
    sourceCollisions,
    reportUpdates,
  };
}

function assertSourcePlansStillCommitted(
  plans: ReturnType<typeof buildPlans>,
  payloadRoot: string,
): void {
  for (const plan of plans.sources) {
    const inspected = inspectCommittedRepositorySource(plan.file, {
      projectRoot,
      requiredRoot: payloadRoot,
    });
    if (!inspected.source) {
      throw new Error(
        `repository source changed before execute: ${relative(projectRoot, plan.file)} (${inspected.issues.join(", ")})`,
      );
    }
    const currentHash = seedManifestHash(inspected.content.toString("utf8"));
    if (
      currentHash !== plan.manifestHash ||
      !plan.repositorySource ||
      !isDeepStrictEqual(inspected.source, plan.repositorySource)
    ) {
      throw new Error(
        `repository source snapshot mismatch before execute: ${relative(projectRoot, plan.file)}`,
      );
    }
  }
}

async function executeBackfill(
  client: MongoClient,
  db: Db,
  plans: ReturnType<typeof buildPlans>,
): Promise<void> {
  assertSourcePlansStillCommitted(
    plans,
    resolve(projectRoot, "scripts/seed-payloads"),
  );
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      for (const plan of plans.sources) {
        const expected = sourceDocument(plan, now);
        await db.collection("lore_sources").updateOne(
          { sourceId: plan.sourceId },
          { $setOnInsert: expected },
          { upsert: true, session },
        );
        const saved = await db.collection("lore_sources").findOne(
          { sourceId: plan.sourceId },
          { session },
        );
        if (!saved) {
          throw new Error(`source reread failed: ${plan.sourceId}`);
        }
        const parsedSaved = parseStoredLoreSource(saved);
        if (
          !isDeepStrictEqual(
            immutableLoreSourcePayload(parsedSaved),
            immutableLoreSourcePayload(expected),
          )
        ) {
          throw new Error(`immutable source collision: ${plan.sourceId}`);
        }
      }

      for (const plan of plans.reports) {
        const row = await db.collection("session_reports").findOne(
          { sessionId: plan.sessionId },
          { session },
        );
        if (!row) throw new Error(`historical report missing: ${plan.sessionId}`);
        const provenanceUpdate = buildReportProvenanceUpdate(
          row,
          plan.sourceIds,
        );
        const desired = provenanceUpdate.desired;
        const current = Array.isArray(row.provenanceSourceIds)
          ? [...row.provenanceSourceIds].sort()
          : [];
        if (!isDeepStrictEqual(current, desired) || provenanceUpdate.removesLegacy) {
          const result = await db.collection("session_reports").updateOne(
            { _id: row._id, updatedAt: row.updatedAt },
            {
              $set: { provenanceSourceIds: desired },
              $unset: { provenanceSourceId: "" },
              $currentDate: { updatedAt: true },
            },
            { session },
          );
          if (result.matchedCount !== 1) {
            throw new Error(`report provenance CAS failed: ${plan.sessionId}`);
          }
        }
        const saved = await db.collection("session_reports").findOne(
          { _id: row._id },
          { session },
        );
        if (!saved) throw new Error(`report provenance reread failed: ${plan.sessionId}`);
        validateSeedStoredDocument("session_reports", saved);
        const savedLedger = currentProvenanceLedger(saved);
        if (
          Object.hasOwn(saved, "provenanceSourceId") ||
          desired.some((sourceId) => !savedLedger.includes(sourceId))
        ) {
          throw new Error(`report provenance postcondition failed: ${plan.sessionId}`);
        }
      }
    });
  } finally {
    await session.endSession();
  }
}

function inspectionBlockers(
  inspection: Awaited<ReturnType<typeof inspect>>,
  options: { requireNoPendingUpdates: boolean },
): string[] {
  return [
    ...inspection.indexIssues.map((value) => `index_contract:${value}`),
    ...inspection.duplicateUniqueKeys.map((value) => `duplicate_unique_key:${value}`),
    ...inspection.repositorySourceIssues.map(
      (value) => `repository_source:${value}`,
    ),
    ...inspection.missingReports.map((value) => `missing_report:${value}`),
    ...inspection.invalidLedgers.map((value) => `invalid_ledger:${value}`),
    ...inspection.invalidStoredReports.map(
      (value) => `invalid_stored_report:${value}`,
    ),
    ...inspection.invalidStoredSources.map(
      (value) => `invalid_stored_source:${value}`,
    ),
    ...inspection.sourceCollisions.map((value) => `source_collision:${value}`),
    ...(options.requireNoPendingUpdates
      ? inspection.reportUpdates
          .filter((report) => report.needsUpdate)
          .map((report) => `pending_report_update:${report.sessionId}`)
      : []),
  ];
}

loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));
const rawUri = process.env.MONGODB_URI;
if (!rawUri) throw new Error("MONGODB_URI is required.");
if (
  process.env.DB_NAME &&
  process.env.MONGODB_DB_NAME &&
  process.env.DB_NAME !== process.env.MONGODB_DB_NAME
) {
  throw new Error("[report-provenance] DB_NAME과 MONGODB_DB_NAME이 다릅니다.");
}
if (EXECUTE && !process.env.DB_NAME && !process.env.MONGODB_DB_NAME) {
  throw new Error("[report-provenance] WRITE에는 DB_NAME 또는 MONGODB_DB_NAME이 필요합니다.");
}
const dbName = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";
const payloadRoot = resolve(projectRoot, "scripts/seed-payloads");
const plans = buildPlans(payloadRoot);
const client = new MongoClient(rawUri);
await client.connect();
try {
  const db = client.db(dbName);
  const before = await inspect(db, plans);
  const preflightBlockers = inspectionBlockers(before, {
    requireNoPendingUpdates: false,
  });
  if (EXECUTE) {
    if (preflightBlockers.length > 0) {
      throw new Error(
        `[report-provenance] preflight blocker: ${preflightBlockers.join(", ")}`,
      );
    }
    await executeBackfill(client, db, plans);
  }
  const after = EXECUTE ? await inspect(db, plans) : before;
  const postflightBlockers = EXECUTE
    ? inspectionBlockers(after, { requireNoPendingUpdates: true })
    : preflightBlockers;
  console.log(
    JSON.stringify(
      {
        mode: EXECUTE ? "execute" : "read-only",
        dbName,
        sourceDocuments: plans.sources.length,
        historicalReports: plans.reports.length,
        pendingReportUpdates: after.reportUpdates.filter(
          (report) => report.needsUpdate,
        ),
        blockers: postflightBlockers,
      },
      null,
      2,
    ),
  );
  if (postflightBlockers.length > 0) {
    if (EXECUTE) {
      throw new Error(
        `[report-provenance] postflight blocker: ${postflightBlockers.join(", ")}`,
      );
    }
    process.exitCode = 2;
  }
} finally {
  await client.close();
}
