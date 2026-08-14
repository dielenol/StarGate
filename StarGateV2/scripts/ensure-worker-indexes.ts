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
  type CreateIndexesOptions,
  type IndexDescriptionInfo,
} from "mongodb";

import { compareIndexSpec } from "./index-spec.ts";
import { WORKER_REQUIRED_INDEXES } from "./worker-index-specs.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

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

function requiredDbName(): string {
  const mongodbDbName = process.env.MONGODB_DB_NAME?.trim();
  const legacyDbName = process.env.DB_NAME?.trim();

  if (
    mongodbDbName &&
    legacyDbName &&
    mongodbDbName !== legacyDbName
  ) {
    throw new Error(
      "MONGODB_DB_NAME and DB_NAME must match for worker index apply.",
    );
  }

  const dbName = mongodbDbName ?? legacyDbName;
  if (!dbName) {
    throw new Error(
      "MONGODB_DB_NAME or DB_NAME must be set explicitly for worker index apply.",
    );
  }
  return dbName;
}

function isNamespaceMissing(error: unknown): boolean {
  return (
    error instanceof MongoServerError &&
    (error.code === 26 || error.codeName === "NamespaceNotFound")
  );
}

async function listIndexes(
  db: Awaited<ReturnType<typeof getDb>>,
  collection: string,
): Promise<IndexDescriptionInfo[]> {
  try {
    return await db.collection(collection).listIndexes().toArray();
  } catch (error) {
    if (isNamespaceMissing(error)) return [];
    throw error;
  }
}

loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

const uri = process.env.MONGODB_URI;
const dbName = requiredDbName();
const confirmedDbName = process.env.WORKER_INDEX_TARGET_DB?.trim();

if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}
if (!confirmedDbName || confirmedDbName !== dbName) {
  throw new Error(
    "WORKER_INDEX_TARGET_DB must exactly match the configured database name.",
  );
}

const indexUri = withDefaultUriOptions(uri, {
  connectTimeoutMS: "15000",
  serverSelectionTimeoutMS: "15000",
});

initServerless({ uri: indexUri, dbName, maxPoolSize: 5 });

try {
  const db = await getDb();
  if (db.databaseName !== confirmedDbName) {
    throw new Error(
      "Connected database does not match WORKER_INDEX_TARGET_DB.",
    );
  }

  const indexesByCollection = new Map<
    string,
    IndexDescriptionInfo[]
  >();
  for (const collection of new Set(
    WORKER_REQUIRED_INDEXES.map((index) => index.collection),
  )) {
    indexesByCollection.set(
      collection,
      await listIndexes(db, collection),
    );
  }
  const forbiddenStockHistoryTtlIndexes = (
    indexesByCollection.get("stock_price_history") ?? []
  ).filter((index) => typeof index.expireAfterSeconds === "number");
  if (forbiddenStockHistoryTtlIndexes.length > 0) {
    throw new Error(
      `NOVEX migration must remove stock_price_history TTL indexes before worker index apply: ${forbiddenStockHistoryTtlIndexes
        .map((index) => index.name)
        .join(",")}`,
    );
  }

  const pending = [];
  const alreadyPresent = [];
  for (const required of WORKER_REQUIRED_INDEXES) {
    const actual = indexesByCollection
      .get(required.collection)
      ?.find((index) => index.name === required.name);
    if (!actual) {
      pending.push(required);
      continue;
    }

    const issues = compareIndexSpec(required, actual);
    if (issues.length > 0) {
      throw new Error(
        `Existing index mismatch: ${required.collection}.${required.name} (${issues.join(",")})`,
      );
    }
    alreadyPresent.push({
      collection: required.collection,
      name: required.name,
    });
  }

  const ttlImpacts = [];
  for (const required of pending.filter(
    (index) => index.expireAfterSeconds !== undefined,
  )) {
    const field = Object.keys(required.key)[0];
    if (!field || Object.keys(required.key).length !== 1) {
      throw new Error(
        `TTL index must have exactly one key: ${required.collection}.${required.name}`,
      );
    }

    const cutoff = new Date(
      Date.now() - required.expireAfterSeconds! * 1_000,
    );
    const expiredDocuments = await db
      .collection(required.collection)
      .countDocuments({ [field]: { $lt: cutoff } });
    ttlImpacts.push({
      collection: required.collection,
      name: required.name,
      cutoff: cutoff.toISOString(),
      expiredDocuments,
    });

    if (
      expiredDocuments > 0 &&
      process.env.WORKER_INDEX_TTL_PURGE_CONFIRM?.trim() !==
        String(expiredDocuments)
    ) {
      throw new Error(
        `WORKER_INDEX_TTL_PURGE_CONFIRM must equal ${expiredDocuments} before creating ${required.collection}.${required.name}.`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: "worker-indexes-only-plan",
        dbName,
        create: pending.map(({ collection, name }) => ({
          collection,
          name,
        })),
        alreadyPresent,
        ttlImpacts,
      },
      null,
      2,
    ),
  );

  const created: Array<{ collection: string; name: string }> = [];
  const orderedPending = [
    ...pending.filter(
      (index) => index.expireAfterSeconds === undefined,
    ),
    ...pending.filter(
      (index) => index.expireAfterSeconds !== undefined,
    ),
  ];

  for (const required of orderedPending) {
    const options: CreateIndexesOptions = {
      name: required.name,
      ...(required.unique === undefined
        ? {}
        : { unique: required.unique }),
      ...(required.partialFilterExpression === undefined
        ? {}
        : {
            partialFilterExpression:
              required.partialFilterExpression,
          }),
      ...(required.expireAfterSeconds === undefined
        ? {}
        : { expireAfterSeconds: required.expireAfterSeconds }),
    };

    await db
      .collection(required.collection)
      .createIndex(required.key, options);
    created.push({
      collection: required.collection,
      name: required.name,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: "worker-indexes-only",
        dbName,
        created,
        alreadyPresent,
      },
      null,
      2,
    ),
  );
} finally {
  const client = await getClient().catch(() => null);
  await client?.close();
  await close();
}
