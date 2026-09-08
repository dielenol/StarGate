import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, beforeEach, test } from "node:test";

import { MongoClient, ObjectId } from "mongodb";
import { buildOperationHonorRecords, reduceOperationHonorSource } from "@stargate/core";
import { close, connect, getDb, HONOR_INDEX_DEFINITIONS } from "@stargate/shared-db";

import { applyManifest, parseArgs } from "./backfill.ts";
import { validateManualReviewItems } from "./manual-review.ts";
import {
  createHallOfFameBackfillManifest,
  deserializeManifestRecords,
  serializeHonorRecord,
} from "./manifest.ts";

// No environment file or externally supplied DB URI is read. Each run owns a
// fresh, loopback-only replica set and removes that container in the after hook.
const exec = promisify(execFile);
const runId = randomUUID().replaceAll("-", "");
const container = `stargate-honor-test-${runId}`;
const database = `stargate_honor_test_${runId}`;
const revision = new Date("2026-08-01T00:00:00.000Z");
const issuedAt = new Date("2026-08-02T00:00:00.000Z");
const collectionNames = [
  "session_reports", "characters", "users", "honor_records",
  "honor_analysis_states", "notifications",
];
let containerCreated = false;
let db;
let fixture;

async function docker(...args) {
  return (await exec("docker", args, { timeout: 30_000 })).stdout.trim();
}

before(async () => {
  // Require the existing local image instead of silently downloading software.
  await docker("image", "inspect", "mongo:7");
  await docker(
    "run", "--detach", "--name", container, "--publish", "127.0.0.1::27017",
    "mongo:7", "mongod", "--replSet", "honorTest", "--bind_ip_all",
    "--setParameter", "enableTestCommands=1",
  );
  containerCreated = true;
  const port = (await docker("port", container, "27017/tcp")).split(":").at(-1);
  assert.match(port, /^\d+$/u);
  const uri = `mongodb://127.0.0.1:${port}/?directConnection=true&replicaSet=honorTest`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await docker(
        "exec", container, "mongosh", "--quiet", "--eval",
        'try { rs.status() } catch { rs.initiate({_id:"honorTest",members:[{_id:0,host:"127.0.0.1:27017"}]}) }',
      );
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert.equal(ready, true, "isolated Mongo replica set must start");
  const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 500 });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const hello = await probe.db("admin").command({ hello: 1 });
        if (hello.isWritablePrimary) break;
      } catch {
        // Election can still be in progress after rs.initiate returns.
      }
      assert.notEqual(attempt, 59, "isolated Mongo must become primary");
      await delay(250);
    }
  } finally {
    await probe.close();
  }
  await connect({ uri, dbName: database, maxPoolSize: 3 });
  db = await getDb();
}, { timeout: 60_000 });

after(async () => {
  try {
    await close();
  } finally {
    if (containerCreated) {
      await docker("rm", "--force", "--volumes", container);
      const remaining = await docker("ps", "--all", "--quiet", "--filter", `name=^/${container}$`);
      assert.equal(remaining, "", "task-owned container must be removed");
    }
  }
});

function buildFixture() {
  const owners = ["A", "B"].map((suffix) => ({ _id: new ObjectId(), status: "ACTIVE", name: suffix }));
  const characters = owners.map((owner) => ({
    _id: new ObjectId(), codename: `AGENT-${owner.name}`, type: "AGENT", ownerId: String(owner._id),
  }));
  const npc = { _id: new ObjectId(), codename: "NPC-A", type: "NPC" };
  const reports = characters.map((character, index) => ({
    _id: new ObjectId(), sessionId: `REPORT-${owners[index].name}`,
    sessionTitle: `${owners[index].name} 검증 작전`, minRole: "U",
    summary: `${character.codename}은 현장을 조사했다.`,
    highlights: [
      `${character.codename}은 첫 위험을 분석했다.`,
      `${character.codename}은 두 번째 위협을 격리했다.`,
    ],
    relatedPersonnelCodenames: [character.codename, ...(index === 0 ? [npc.codename] : [])],
    createdAt: revision, updatedAt: revision,
  }));
  const operations = reports.map((report, index) => {
    const source = reduceOperationHonorSource({ report, characters: [characters[index]] });
    assert.ok(source);
    const honors = validateManualReviewItems({ source, items: [{
      sourceKey: report.sessionId, codename: characters[index].codename,
      category: "RESEARCH_TECH", title: "현장 분석 공적", citation: "현장의 위험을 분석하고 위협을 격리했다.",
      evidence: [{ section: "HIGHLIGHT", index: 0 }, { section: "HIGHLIGHT", index: 1 }],
    }] });
    return {
      sourceKey: report.sessionId, sourceRecordId: String(report._id),
      sourceRevision: revision.toISOString(), sourceHash: source.sourceHash,
      records: buildOperationHonorRecords({ source, honors, issuedAt }).map(serializeHonorRecord),
    };
  });
  const manifest = createHallOfFameBackfillManifest({
    generatedAt: issuedAt.toISOString(), database, operations, novex: [], skipped: [], issues: [],
  });
  return { owners, characters, npc, reports, manifest };
}

beforeEach(async () => {
  // This name is generated above and only exists in this task-owned container.
  await db.dropDatabase();
  for (const name of collectionNames) await db.createCollection(name);
  for (const [name, definitions] of Object.entries(HONOR_INDEX_DEFINITIONS)) {
    await db.collection(name).createIndexes(definitions);
  }
  await db.collection("characters").createIndex({ codename: 1 }, { unique: true, name: "codename_unique" });
  fixture = buildFixture();
  await db.collection("users").insertMany(fixture.owners);
  await db.collection("characters").insertMany([...fixture.characters, fixture.npc]);
  await db.collection("session_reports").insertMany(fixture.reports);
  const other = fixture.manifest.operations[1];
  await db.collection("honor_records").insertMany(deserializeManifestRecords(other.records));
  await db.collection("honor_analysis_states").insertOne({
    _id: "session-report:REPORT-B", sourceType: "SESSION_REPORT", sourceKey: "REPORT-B",
    sourceRecordId: other.sourceRecordId, sourceHash: other.sourceHash,
    analyzerRevision: fixture.manifest.analyzerRevision, status: "SUCCEEDED",
    analyzedAt: issuedAt, createdAt: issuedAt, updatedAt: issuedAt, attempts: 0,
  });
});

async function snapshot() {
  return Object.fromEntries(await Promise.all(collectionNames.map(async (name) => [
    name, await db.collection(name).find({}).sort({ _id: 1 }).toArray(),
  ])));
}

async function otherSourceSnapshot() {
  return {
    report: await db.collection("session_reports").findOne({ sessionId: "REPORT-B" }),
    character: await db.collection("characters").findOne({ _id: fixture.characters[1]._id }),
    owner: await db.collection("users").findOne({ _id: fixture.owners[1]._id }),
    honors: await db.collection("honor_records").find({ "source.key": "REPORT-B" }).toArray(),
    state: await db.collection("honor_analysis_states").findOne({ sourceKey: "REPORT-B" }),
  };
}

async function apply(options = {}, manifest = fixture.manifest) {
  return applyManifest(manifest, database, { notifyNew: false, sourceKey: "REPORT-A", ...options });
}

async function rejectsWithoutWrites(expected, options = {}, manifest = fixture.manifest) {
  const before = await snapshot();
  await assert.rejects(() => apply(options, manifest), expected);
  assert.deepEqual(await snapshot(), before, "failed apply must leave every document unchanged");
}

test("single-source apply and replay preserve the unrelated source and honor issuance date", async () => {
  const otherBefore = await otherSourceSnapshot();
  assert.deepEqual(await apply(), {
    operationsApplied: 1, operationsNoop: 0, skippedApplied: 0, skippedNoop: 0, notificationsCreated: 0,
  });
  const first = await db.collection("honor_records").findOne({ "source.key": "REPORT-A" });
  assert.ok(first);
  assert.equal(first.status, "ACTIVE");
  assert.equal(first.issuedAt.toISOString(), issuedAt.toISOString());
  assert.deepEqual(await otherSourceSnapshot(), otherBefore);
  const selectedReport = await db.collection("session_reports").findOne({ sessionId: "REPORT-A" });
  const selectedNpc = await db.collection("characters").findOne({ _id: fixture.npc._id });
  assert.ok(selectedReport.__honorAnalysisLockAt instanceof Date);
  assert.ok(selectedNpc.__honorAnalysisLockAt instanceof Date);
  assert.equal((await apply()).operationsNoop, 1);
  assert.equal(await db.collection("honor_records").countDocuments({ "source.key": "REPORT-A" }), 1);
  assert.deepEqual(await db.collection("honor_records").findOne({ "source.key": "REPORT-A" }), first);
  assert.deepEqual(await otherSourceSnapshot(), otherBefore);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
});

test("dry-run aborts honors, review state, identity locks and even opt-in notification writes", async () => {
  const before = await snapshot();
  const summary = await apply({ dryRun: true, notifyNew: true });
  assert.equal(summary.operationsApplied, 1);
  assert.equal(summary.notificationsCreated, 1, "transaction exercises the notification branch before abort");
  assert.deepEqual(await snapshot(), before);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
});

test("a stale unrelated report does not expand or block the selected source", async () => {
  await db.collection("session_reports").updateOne({ sessionId: "REPORT-B" }, { $set: { summary: "다른 작업에서 변경" } });
  const otherBefore = await otherSourceSnapshot();
  assert.equal((await apply()).operationsApplied, 1);
  assert.deepEqual(await otherSourceSnapshot(), otherBefore);
});

test("changed report revision or source text rejects without surviving writes", async () => {
  await db.collection("session_reports").updateOne({ sessionId: "REPORT-A" }, { $set: { updatedAt: issuedAt } });
  await rejectsWithoutWrites(/BACKFILL_OPERATION_SOURCE_CHANGED/u);
  await db.collection("session_reports").updateOne({ sessionId: "REPORT-A" }, { $set: { updatedAt: revision, summary: "내용이 변경됨" } });
  await rejectsWithoutWrites(/BACKFILL_OPERATION_SOURCE_CHANGED/u);
});

test("changed candidate eligibility rejects instead of crediting the reviewed identity", async () => {
  await db.collection("users").updateOne({ _id: fixture.owners[0]._id }, { $set: { status: "SUSPENDED" } });
  await rejectsWithoutWrites(/BACKFILL_OPERATION_SOURCE_CHANGED/u);
  await db.collection("users").updateOne({ _id: fixture.owners[0]._id }, { $set: { status: "ACTIVE" } });
  await db.collection("characters").updateOne({ _id: fixture.characters[0]._id }, { $set: { type: "NPC" } });
  await rejectsWithoutWrites(/BACKFILL_OPERATION_SOURCE_CHANGED/u);
});

test("a concurrent owner suspension forces transaction retry and source revalidation", async () => {
  const before = await snapshot();
  const configured = await db.admin().command({
    configureFailPoint: "failCommand", mode: { times: 1 },
    data: { failCommands: ["update"], blockConnection: true, blockTimeMS: 1500 },
  });
  const pending = apply();
  // Attach a handler immediately while the second connection waits for the
  // first dependency write; assert.rejects below checks the actual result.
  void pending.catch(() => {});
  try {
    await db.admin().command({
      waitForFailPoint: "failCommand", timesEntered: configured.count + 1, maxTimeMS: 5000,
    });
    await db.collection("users").updateOne(
      { _id: fixture.owners[0]._id }, { $set: { status: "SUSPENDED" } },
    );
    await assert.rejects(pending, /BACKFILL_OPERATION_SOURCE_CHANGED/u);
    const after = await snapshot();
    // Adjust only the scalar changed by the competing writer while retaining
    // the original snapshot's BSON identities and every other document field.
    before.users.find((owner) => owner._id.equals(fixture.owners[0]._id)).status = "SUSPENDED";
    assert.deepEqual(after, before, "only the competing owner write may survive");
  } finally {
    await db.admin().command({ configureFailPoint: "failCommand", mode: "off" });
  }
});

test("live, expired and partial review leases all block online apply without document changes", async () => {
  const states = db.collection("honor_analysis_states");
  for (const fields of [
    { status: "LEASED", leaseToken: "synthetic-lease", leaseUntil: new Date("2100-01-01") },
    { status: "LEASED", leaseToken: "expired-lease", leaseUntil: new Date("2000-01-01") },
    { status: "LEASED" },
    { status: "SUCCEEDED", leaseToken: "partial-token" },
    { status: "SUCCEEDED", leaseUntil: new Date("2000-01-01") },
  ]) {
    await states.replaceOne(
      { _id: "session-report:REPORT-A" },
      { _id: "session-report:REPORT-A", sourceType: "SESSION_REPORT", sourceKey: "REPORT-A", ...fields },
      { upsert: true },
    );
    await rejectsWithoutWrites(/BACKFILL_ONLINE_REVIEW_LEASE_PRESENT/u);
  }
});

test("missing NPC identity or owner rejects the online scope before any committed locks", async () => {
  await db.collection("characters").deleteOne({ _id: fixture.npc._id });
  await rejectsWithoutWrites(/BACKFILL_ONLINE_IDENTITY_DEPENDENCY_MISSING/u);
  await db.collection("characters").insertOne(fixture.npc);
  await db.collection("users").deleteOne({ _id: fixture.owners[0]._id });
  await rejectsWithoutWrites(/BACKFILL_ONLINE_OWNER_DEPENDENCY_MISSING/u);
});

test("absent or sparse codename uniqueness rejects online application", async () => {
  await db.collection("characters").dropIndex("codename_unique");
  await rejectsWithoutWrites(/BACKFILL_ONLINE_CODENAME_INDEX_REQUIRED/u);
  await db.collection("characters").createIndex({ codename: 1 }, { unique: true, sparse: true, name: "codename_sparse" });
  await rejectsWithoutWrites(/BACKFILL_ONLINE_CODENAME_INDEX_REQUIRED/u);
});

test("missing honor unique index rejects without creating indexes or changing documents", async () => {
  await db.collection("honor_records").dropIndex("honor_records_logicalKey_unique");
  const indexesBefore = await db.collection("honor_records").listIndexes().toArray();
  await rejectsWithoutWrites(/HONOR_INDEXES_NOT_READY/u);
  assert.deepEqual(await db.collection("honor_records").listIndexes().toArray(), indexesBefore);
});

test("wrong scope, hidden source and tampered manifest all reject without writes", async () => {
  await rejectsWithoutWrites(/BACKFILL_SOURCE_SCOPE_NOT_FOUND_OR_AMBIGUOUS/u, { sourceKey: "REPORT-ABSENT" });
  const tampered = structuredClone(fixture.manifest);
  tampered.operations[0].records[0].title = "변조된 공적";
  await rejectsWithoutWrites(/HALL_OF_FAME_MANIFEST_HASH_MISMATCH/u, {}, tampered);
  await db.collection("session_reports").updateOne({ sessionId: "REPORT-A" }, { $set: { minRole: "GM" } });
  await rejectsWithoutWrites(/BACKFILL_MANIFEST_COVERAGE_CHANGED/u);
});

test("CLI preserves approved full execution and accepts a scoped dry-run without approval", () => {
  const full = parseArgs(["--", "--execute", "--manifest", "/tmp/review.json", "--yes"]);
  assert.equal(full.execute, true);
  assert.equal(full.yes, true);
  assert.equal(full.dryRun, false);
  assert.equal(full.sourceKey, undefined);
  const scoped = parseArgs([
    "--dry-run", "--manifest", "/tmp/review.json", "--source-key", " REPORT-A ", "--notify-new",
  ]);
  assert.equal(scoped.dryRun, true);
  assert.equal(scoped.execute, false);
  assert.equal(scoped.yes, false);
  assert.equal(scoped.sourceKey, "REPORT-A");
  assert.equal(scoped.notifyNew, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
});

test("CLI requires one execution mode, an execution approval and an explicit dry-run source", () => {
  const manifest = ["--manifest", "/tmp/review.json"];
  for (const args of [
    manifest,
    ["--execute", ...manifest],
    ["--execute", "--dry-run", "--yes", ...manifest, "--source-key", "REPORT-A"],
    ["--execute", "--yes"],
  ]) {
    assert.throws(() => parseArgs(args), /필수입니다/u);
  }
  assert.throws(
    () => parseArgs(["--dry-run", ...manifest]),
    /BACKFILL_DRY_RUN_SOURCE_KEY_REQUIRED/u,
  );
});

test("CLI rejects source flag typos, duplicate keys and empty or missing source values", () => {
  const base = ["--execute", "--yes", "--manifest", "/tmp/review.json"];
  assert.throws(() => parseArgs([...base, "--sorce-key", "REPORT-A"]), /알 수 없는 인자/u);
  assert.throws(
    () => parseArgs([...base, "--source-key", "REPORT-A", "--source-key", "REPORT-A"]),
    /보고서 하나만/u,
  );
  for (const suffix of [
    ["--source-key"], ["--source-key", ""], ["--source-key", "--notify-new"],
  ]) {
    assert.throws(() => parseArgs([...base, ...suffix]), /뒤에 경로가 필요/u);
  }
  assert.throws(() => parseArgs([...base, "--source-key", "   "]), /보고서 하나만/u);
});

test("exported apply rejects an unscoped dry-run without changing any database document", async () => {
  await rejectsWithoutWrites(
    /BACKFILL_DRY_RUN_SOURCE_KEY_REQUIRED/u,
    { dryRun: true, sourceKey: undefined, notifyNew: true },
  );
});
