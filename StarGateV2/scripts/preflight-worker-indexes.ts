import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  close,
  getClient,
  getDb,
  initServerless,
} from "@stargate/shared-db";
import {
  MongoServerError,
  type Document,
  type Filter,
  type Sort,
} from "mongodb";

import {
  compareIndexSpec,
} from "./index-spec.ts";
import { WORKER_REQUIRED_INDEXES } from "./worker-index-specs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const DUPLICATE_GROUP_LIMIT = 1_001;

interface DuplicateCheck {
  name: string;
  collection: string;
  pipeline: Document[];
}

interface ExplainCheck {
  name: string;
  collection: string;
  filter: (now: Date) => Filter<Document>;
  sort: Sort;
}

const DUPLICATE_CHECKS: DuplicateCheck[] = [
  {
    name: "shared_inventory.scope+itemId",
    collection: "shared_inventory",
    pipeline: duplicatePipeline({}, {
      scope: "$scope",
      itemId: "$itemId",
    }),
  },
  {
    name: "shop_daily_stock.itemId",
    collection: "shop_daily_stock",
    pipeline: duplicatePipeline({}, "$itemId"),
  },
  {
    name: "stock_prices.ticker",
    collection: "stock_prices",
    pipeline: duplicatePipeline({}, "$ticker"),
  },
  {
    name: "notifications.dedupeKey",
    collection: "notifications",
    pipeline: duplicatePipeline(
      { dedupeKey: { $type: "string" } },
      "$dedupeKey",
    ),
  },
  {
    name: "stock_price_history.operationKey",
    collection: "stock_price_history",
    pipeline: duplicatePipeline(
      { operationKey: { $type: "string" } },
      "$operationKey",
    ),
  },
  {
    name: "credit_transactions.dailyAllowance",
    collection: "credit_transactions",
    pipeline: duplicatePipeline(
      { "metadata.dailyAllowance": true },
      {
        date: "$metadata.dailyAllowanceDate",
        characterId: "$characterId",
      },
    ),
  },
  {
    name: "scheduled_job_runs.jobName+slotKey",
    collection: "scheduled_job_runs",
    pipeline: duplicatePipeline({}, {
      jobName: "$jobName",
      slotKey: "$slotKey",
    }),
  },
  {
    name: "integration_outbox.dedupeKey",
    collection: "integration_outbox",
    pipeline: duplicatePipeline({}, "$dedupeKey"),
  },
  {
    name: "worker_checkpoints.name",
    collection: "worker_checkpoints",
    pipeline: duplicatePipeline({}, "$name"),
  },
];

const EXPLAIN_CHECKS: ExplainCheck[] = [
  {
    name: "scheduled_job_runs.due",
    collection: "scheduled_job_runs",
    filter: (now) => ({
      attempts: { $lt: 8 },
      $or: [
        { status: "FAILED", availableAt: { $lte: now } },
        { status: "RUNNING", leaseUntil: { $lte: now } },
      ],
    }),
    sort: { updatedAt: 1 },
  },
  {
    name: "integration_outbox.due",
    collection: "integration_outbox",
    filter: (now) => ({
      $or: [
        { status: "PENDING", availableAt: { $lte: now } },
        { status: "PROCESSING", leaseUntil: { $lte: now } },
      ],
    }),
    sort: { createdAt: 1, _id: 1 },
  },
  {
    name: "research_discord_cards.due",
    collection: "research_discord_cards",
    filter: (now) => ({
      $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
      $and: [
        {
          $or: [
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        },
      ],
    }),
    sort: { updatedAt: 1 },
  },
  {
    name: "equipment_workshop_requests.ameri-dm-due",
    collection: "equipment_workshop_requests",
    filter: (now) => ({
      discordDmOutbox: {
        $elemMatch: {
          availableAt: { $lte: now },
          sentAt: { $exists: false },
          skippedAt: { $exists: false },
        },
      },
      $or: [
        { "discordDmDelivery.leaseUntil": { $exists: false } },
        { "discordDmDelivery.leaseUntil": { $lte: now } },
      ],
      $and: [
        {
          $or: [
            {
              "discordDmDelivery.nextAttemptAt": {
                $exists: false,
              },
            },
            { "discordDmDelivery.nextAttemptAt": { $lte: now } },
          ],
        },
      ],
    }),
    sort: { updatedAt: 1 },
  },
];

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
  let envContent = "";
  try {
    envContent = readFileSync(path, "utf-8");
  } catch {
    return;
  }

  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator);
    const value = normalizeEnvValue(trimmed.slice(separator + 1));
    if (process.env[key] === undefined) process.env[key] = value;
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

function duplicatePipeline(match: Document, key: unknown): Document[] {
  return [
    { $match: match },
    { $group: { _id: key, occurrences: { $sum: 1 } } },
    { $match: { occurrences: { $gt: 1 } } },
    { $limit: DUPLICATE_GROUP_LIMIT },
    { $count: "groups" },
  ];
}

function isNamespaceMissing(error: unknown): boolean {
  return (
    error instanceof MongoServerError &&
    (error.code === 26 || error.codeName === "NamespaceNotFound")
  );
}

function collectIndexNames(value: unknown, names = new Set<string>()): string[] {
  if (!value || typeof value !== "object") return [...names];
  if (Array.isArray(value)) {
    for (const item of value) collectIndexNames(item, names);
    return [...names];
  }

  const record = value as Record<string, unknown>;
  if (typeof record.indexName === "string") names.add(record.indexName);
  for (const nested of Object.values(record)) {
    collectIndexNames(nested, names);
  }
  return [...names].sort();
}

function numericField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : null;
}

loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

const uri = process.env.MONGODB_URI;
const dbName =
  process.env.MONGODB_DB_NAME ?? process.env.DB_NAME ?? "stargate";

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const preflightUri = withDefaultUriOptions(uri, {
  connectTimeoutMS: "15000",
  serverSelectionTimeoutMS: "15000",
});

initServerless({ uri: preflightUri, dbName, maxPoolSize: 5 });

try {
  const db = await getDb();
  const now = new Date();
  const indexResults = [];
  for (const required of WORKER_REQUIRED_INDEXES) {
    try {
      const indexes = await db
        .collection(required.collection)
        .listIndexes()
        .toArray();
      const actual = indexes.find((index) => index.name === required.name);
      const issues = actual
        ? compareIndexSpec(required, actual)
        : ["missing"];
      indexResults.push({
        collection: required.collection,
        name: required.name,
        present: actual !== undefined,
        valid: actual !== undefined && issues.length === 0,
        issues,
      });
    } catch (error) {
      if (!isNamespaceMissing(error)) throw error;
      indexResults.push({
        collection: required.collection,
        name: required.name,
        present: false,
        valid: false,
        issues: ["collection_missing"],
      });
    }
  }

  const ttlImpacts = [];
  for (const required of WORKER_REQUIRED_INDEXES.filter(
    (index) => index.expireAfterSeconds !== undefined,
  )) {
    const field = Object.keys(required.key)[0];
    if (!field || Object.keys(required.key).length !== 1) {
      throw new Error(
        `TTL index must have exactly one key: ${required.collection}.${required.name}`,
      );
    }
    const cutoff = new Date(
      now.getTime() - required.expireAfterSeconds! * 1_000,
    );
    try {
      const expiredDocuments = await db
        .collection(required.collection)
        .countDocuments({ [field]: { $lt: cutoff } });
      const indexResult = indexResults.find(
        (result) =>
          result.collection === required.collection &&
          result.name === required.name,
      );
      ttlImpacts.push({
        collection: required.collection,
        name: required.name,
        present: indexResult?.present ?? false,
        cutoff: cutoff.toISOString(),
        expiredDocuments,
        wouldBeginDeletion:
          indexResult?.present !== true && expiredDocuments > 0,
      });
    } catch (error) {
      if (!isNamespaceMissing(error)) throw error;
      ttlImpacts.push({
        collection: required.collection,
        name: required.name,
        present: false,
        cutoff: cutoff.toISOString(),
        expiredDocuments: 0,
        wouldBeginDeletion: false,
        collectionMissing: true,
      });
    }
  }

  const duplicateResults = [];
  for (const check of DUPLICATE_CHECKS) {
    try {
      const result = await db
        .collection(check.collection)
        .aggregate<{ groups: number }>(check.pipeline, {
          allowDiskUse: false,
        })
        .next();
      const groups = result?.groups ?? 0;
      duplicateResults.push({
        name: check.name,
        duplicateGroups:
          groups >= DUPLICATE_GROUP_LIMIT
            ? `>=${DUPLICATE_GROUP_LIMIT}`
            : groups,
      });
    } catch (error) {
      if (!isNamespaceMissing(error)) throw error;
      duplicateResults.push({
        name: check.name,
        duplicateGroups: 0,
        collectionMissing: true,
      });
    }
  }

  const explainResults = [];
  for (const check of EXPLAIN_CHECKS) {
    try {
      const explain = await db
        .collection(check.collection)
        .find(check.filter(now))
        .sort(check.sort)
        .limit(1)
        .explain("executionStats");
      const executionStats =
        explain && typeof explain === "object"
          ? (explain as Record<string, unknown>).executionStats
          : null;
      explainResults.push({
        name: check.name,
        indexes: collectIndexNames(explain),
        totalDocsExamined: numericField(
          executionStats,
          "totalDocsExamined",
        ),
        totalKeysExamined: numericField(
          executionStats,
          "totalKeysExamined",
        ),
        nReturned: numericField(executionStats, "nReturned"),
      });
    } catch (error) {
      if (!isNamespaceMissing(error)) throw error;
      explainResults.push({
        name: check.name,
        unavailable: "collection_missing",
      });
    }
  }

  const invalidIndexes = indexResults.filter((result) => !result.valid);
  const duplicateBlockers = duplicateResults.filter(
    (result) => result.duplicateGroups !== 0,
  );
  const blockers = [
    ...invalidIndexes.map(
      (result) =>
        `invalid_index:${result.collection}.${result.name}:${result.issues.join(",")}`,
    ),
    ...duplicateBlockers.map(
      (result) =>
        `duplicate_groups:${result.name}:${result.duplicateGroups}`,
    ),
  ];

  console.log(
    JSON.stringify(
      {
        mode: "read-only",
        checkedAt: now.toISOString(),
        dbName,
        indexes: indexResults,
        ttlImpacts,
        duplicates: duplicateResults,
        explains: explainResults,
        blockers,
      },
      null,
      2,
    ),
  );

  if (blockers.length > 0) process.exitCode = 2;
} finally {
  const client = await getClient().catch(() => null);
  await client?.close();
  await close();
}
