/**
 * Stable character identity rename with exhaustive reverse-reference inventory.
 * Default is read-only. Live write requires --execute --yes --allow-identity-migration.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  loreIngestionRunSchema,
  loreSourceDocumentSchema,
} from "@stargate/shared-db/schemas";
import {
  MongoClient,
  type ClientSession,
  type Db,
  type Document,
} from "mongodb";

import {
  codenameMigrationHash,
  planCodenameDocument,
  type CodenameMigrationBlocker,
} from "./lib/character-codename-migration.ts";

function loadEnvFile(name: string): void {
  try {
    for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    // Optional. main validates connection requirements.
  }
}

function option(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const FROM = option("--from").trim();
const TO = option("--to").trim();
const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const ALLOW_IDENTITY_MIGRATION = process.argv.includes("--allow-identity-migration");
if (!/^[A-Z0-9_]+$/u.test(FROM) || !/^[A-Z0-9_]+$/u.test(TO) || FROM === TO) {
  throw new Error("[codename-migration] 서로 다른 --from/--to 대문자 codename이 필요합니다.");
}
if (EXECUTE && (!YES || !ALLOW_IDENTITY_MIGRATION)) {
  throw new Error("[codename-migration] WRITE에는 --execute --yes --allow-identity-migration이 모두 필요합니다.");
}
if (
  process.env.DB_NAME &&
  process.env.MONGODB_DB_NAME &&
  process.env.DB_NAME !== process.env.MONGODB_DB_NAME
) {
  throw new Error("[codename-migration] DB_NAME과 MONGODB_DB_NAME이 다릅니다.");
}
const DB_NAME = process.env.DB_NAME ?? process.env.MONGODB_DB_NAME ?? "stargate";
if (EXECUTE && !process.env.DB_NAME && !process.env.MONGODB_DB_NAME) {
  throw new Error("[codename-migration] WRITE에는 DB_NAME 또는 MONGODB_DB_NAME을 명시해야 합니다.");
}
const URI = process.env.MONGODB_URI;
if (!URI) throw new Error("[codename-migration] MONGODB_URI가 필요합니다.");

interface PlannedDocument {
  collection: string;
  before: Document;
  after: Document;
  changedPaths: string[];
}

interface MigrationPlan {
  documents: PlannedDocument[];
  blockers: CodenameMigrationBlocker[];
  characterMatches: number;
  targetMatches: number;
  hash: string;
}

async function buildPlan(db: Db, session?: ClientSession): Promise<MigrationPlan> {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("system.") && !name.startsWith("lore_"))
    .sort();
  const documents: PlannedDocument[] = [];
  const blockers: CodenameMigrationBlocker[] = [];
  for (const collection of names) {
    for await (const document of db.collection(collection).find({}, { session })) {
      const planned = planCodenameDocument(collection, document, FROM, TO);
      blockers.push(...planned.blockers);
      if (planned.changed) {
        documents.push({
          collection,
          before: document,
          after: planned.after,
          changedPaths: planned.changedPaths,
        });
      }
    }
  }
  const [characterMatches, targetMatches] = await Promise.all([
    db.collection("characters").countDocuments({ codename: FROM }, { session }),
    db.collection("characters").countDocuments({ codename: TO }, { session }),
  ]);
  const hash = codenameMigrationHash({
    from: FROM,
    to: TO,
    documents: documents.map((document) => ({
      collection: document.collection,
      id: String(document.before._id),
      before: codenameMigrationHash(document.before),
      after: codenameMigrationHash(document.after),
      changedPaths: document.changedPaths,
    })),
    blockers,
    characterMatches,
    targetMatches,
  });
  return { documents, blockers, characterMatches, targetMatches, hash };
}

function assertExecutable(plan: MigrationPlan): void {
  if (plan.characterMatches !== 1) {
    throw new Error(`[codename-migration] source character count=${plan.characterMatches}, expected=1`);
  }
  if (plan.targetMatches !== 0) {
    throw new Error(`[codename-migration] target codename이 이미 존재합니다: ${TO}`);
  }
  if (plan.blockers.length > 0) {
    throw new Error(`[codename-migration] 미분류 문자열 참조 ${plan.blockers.length}건을 먼저 검토해야 합니다.`);
  }
}

function printPlan(plan: MigrationPlan): void {
  console.log(JSON.stringify({
    mode: EXECUTE ? "execute" : "read-only",
    database: DB_NAME,
    from: FROM,
    to: TO,
    characterMatches: plan.characterMatches,
    targetMatches: plan.targetMatches,
    changedDocuments: plan.documents.length,
    changedPaths: plan.documents.reduce((count, document) => count + document.changedPaths.length, 0),
    blockers: plan.blockers,
    planHash: plan.hash,
    requiredFollowUp: "별도 승인 후 lore:rebuild -- --execute --yes",
  }, null, 2));
}

async function executePlan(client: MongoClient, db: Db, preflight: MigrationPlan): Promise<void> {
  assertExecutable(preflight);
  const indexes = await db.collection("characters").listIndexes().toArray();
  const identityIndex = indexes.find((index) => index.name === "characters_codename_unique");
  if (!identityIndex || identityIndex.unique !== true || JSON.stringify(identityIndex.key) !== JSON.stringify({ codename: 1 })) {
    throw new Error("[codename-migration] characters_codename_unique index가 필요합니다.");
  }
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await buildPlan(db, session);
      assertExecutable(current);
      if (current.hash !== preflight.hash) {
        throw new Error("[codename-migration] preflight 이후 대상 snapshot이 변경되었습니다.");
      }
      const now = new Date();
      for (const document of current.documents) {
        const { _id, ...replacement } = document.after;
        const result = await db.collection(document.collection).replaceOne(
          { _id: document.before._id },
          {
            ...replacement,
            ...(document.before.updatedAt instanceof Date ? { updatedAt: now } : {}),
          },
          { session },
        );
        if (result.modifiedCount !== 1) {
          throw new Error(`[codename-migration] replace CAS 실패: ${document.collection}.${String(_id)}`);
        }
        if (
          document.collection === "wiki_pages" &&
          typeof document.before.content === "string"
        ) {
          await db.collection("wiki_page_revisions").insertOne({
            pageId: String(document.before._id),
            content: document.before.content,
            editedById: "system:codename-migration",
            editedByName: `codename-migration:${FROM}->${TO}`,
            createdAt: now,
          }, { session });
        }
      }
      const source = loreSourceDocumentSchema.parse({
        sourceId: `identity-migration:${current.hash.slice(0, 48)}`,
        kind: "database-record",
        title: `Character codename migration ${FROM} -> ${TO}`,
        locator: { kind: "database", value: `characters/${FROM}->${TO}` },
        contentHash: current.hash,
        access: { visibility: "gm-only" },
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await db.collection("lore_sources").insertOne(source, { session });
      const resolved = current.documents.length;
      const run = loreIngestionRunSchema.parse({
        runId: `identity-migration:${randomUUID()}`,
        mode: "search-rebuild",
        status: "failed",
        dryRun: false,
        sourceIds: [source.sourceId],
        manifestHash: current.hash,
        parserVersion: "character-codename-migration-v1",
        stats: {
          discovered: resolved + 1,
          processed: resolved + 1,
          written: resolved,
          skipped: 0,
          blocked: 1,
          failed: 0,
        },
        errors: [{
          code: "IDENTITY_MIGRATION_REQUIRES_REBUILD",
          message: "codename reverse references were migrated; lore projection rebuild is required",
          sourceId: source.sourceId,
        }],
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await db.collection("lore_ingestion_runs").insertOne(run, { session });
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }
}

const client = new MongoClient(URI);
await client.connect();
try {
  const db = client.db(DB_NAME);
  const plan = await buildPlan(db);
  printPlan(plan);
  if (EXECUTE) await executePlan(client, db, plan);
} finally {
  await client.close();
}
