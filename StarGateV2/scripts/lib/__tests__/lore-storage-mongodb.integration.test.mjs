import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { MongoClient } from "mongodb";

const {
  guardDataTransactionOutcome,
  observeInReadOnlySnapshot,
  reconcileDataTransactionCommit,
  runLoreStorageExecutionPhases,
} = await import("../lore-storage-execution.ts");

const TEST_URI = process.env.TEST_MONGODB_URI?.trim();
const HAS_REPLICA_SET =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const HAS_FAILPOINT =
  HAS_REPLICA_SET && process.env.RUN_MONGODB_FAILPOINT_TESTS === "1";
const DB_NAME = `stargate_lore_storage_integration_${process.pid}`;
const APP_NAME = `stargate-lore-storage-integration-${process.pid}`;

let client;
let db;
let failpointEnabledByThisTest = false;

async function withCleanupDeadline(label, operation) {
  let timeout;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} cleanup timeout`)),
          5_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

before(async () => {
  if (!HAS_REPLICA_SET) return;
  client = new MongoClient(TEST_URI, {
    appName: APP_NAME,
    serverSelectionTimeoutMS: 1_000,
  });
  await client.connect();
  db = client.db(DB_NAME);
  await db.dropDatabase();
});

after(async () => {
  if (!HAS_REPLICA_SET) return;
  if (failpointEnabledByThisTest) {
    await withCleanupDeadline("failpoint", async () => {
      await client.db("admin").command({
        configureFailPoint: "failCommand",
        mode: "off",
      });
      failpointEnabledByThisTest = false;
    });
  }
  await withCleanupDeadline("database", () => db.dropDatabase());
  await withCleanupDeadline("client", () => client.close(true));
});

test(
  "실제 replica-set snapshot은 동시 외부 변경 전 plan/target을 함께 관찰한다",
  {
    skip:
      !HAS_REPLICA_SET &&
      "RUN_DB_INTEGRATION_TESTS=1 + TEST_MONGODB_URI 필요 (격리 replica-set 전용)",
  },
  async () => {
    const collection = db.collection("snapshot_state");
    await collection.insertMany([
      { _id: "plan", value: "before" },
      { _id: "target", value: "before" },
    ]);
    const session = client.startSession();
    try {
      const observed = await observeInReadOnlySnapshot(
        (callback, options) => session.withTransaction(callback, options),
        async () => {
          const plan = await collection.findOne(
            { _id: "plan" },
            { session },
          );
          await collection.updateMany(
            { _id: { $in: ["plan", "target"] } },
            { $set: { value: "after" } },
          );
          const target = await collection.findOne(
            { _id: "target" },
            { session },
          );
          return { plan: plan?.value, target: target?.value };
        },
      );

      assert.deepEqual(observed, { plan: "before", target: "before" });
      assert.equal(
        await collection.countDocuments({ value: "after" }),
        2,
      );
    } finally {
      await session.endSession();
    }
  },
);

test(
  "commit 연결 단절은 DDL 없이 unknown으로 남고 snapshot 상태로만 조정된다",
  {
    skip:
      !HAS_FAILPOINT &&
      "RUN_MONGODB_FAILPOINT_TESTS=1 + testCommands-enabled replica-set 필요",
  },
  async () => {
    const collection = db.collection("commit_state");
    await collection.deleteMany({});
    await collection.insertOne({ _id: "target", value: "before" });
    await client.db("admin").command({
      configureFailPoint: "failCommand",
      mode: { times: 2 },
      data: {
        appName: APP_NAME,
        failCommands: ["commitTransaction"],
        closeConnection: true,
      },
    });
    failpointEnabledByThisTest = true;

    let ddlCalls = 0;
    let execution;
    let uncertainSessionId;
    try {
      execution = await runLoreStorageExecutionPhases({
        applyDataPlan: () =>
          guardDataTransactionOutcome(async (markMutationAttempted) => {
            const session = client.startSession();
            uncertainSessionId = session.id;
            try {
              session.startTransaction();
              markMutationAttempted();
              await collection.updateOne(
                { _id: "target" },
                { $set: { value: "after" } },
                { session },
              );
              await session.commitTransaction();
            } finally {
              await session.endSession();
            }
            return { value: "after" };
          }),
        applyIndexDdl: async () => {
          ddlCalls += 1;
        },
      });
    } finally {
      try {
        if (failpointEnabledByThisTest) {
          await client.db("admin").command({
            configureFailPoint: "failCommand",
            mode: "off",
          });
          failpointEnabledByThisTest = false;
        }
      } finally {
        if (uncertainSessionId) {
          await client.db("admin").command({
            killSessions: [uncertainSessionId],
          });
        }
      }
    }

    assert.equal(execution.status, "commit-unknown");
    assert.equal(execution.dataTransaction, "unknown");
    assert.equal(execution.indexDdl, "not-started");
    assert.equal(ddlCalls, 0);

    const session = client.startSession();
    try {
      const observed = await observeInReadOnlySnapshot(
        (callback, options) => session.withTransaction(callback, options),
        async () => {
          const stored = await collection.findOne(
            { _id: "target" },
            { session },
          );
          return stored?.value;
        },
      );
      const committed = observed === "after";
      assert.equal(
        reconcileDataTransactionCommit({
          dataTransaction: execution.dataTransaction,
          approvedMutationCount: 1,
          postReadAvailable: true,
          approvedDataPlanDigest: "approved",
          remainingDataPlanDigest: committed ? "empty" : "approved",
          postconditionState: committed ? "verified" : "mismatch",
        }),
        committed
          ? "state-consistent-with-commit"
          : "state-consistent-with-abort",
      );
    } finally {
      await session.endSession();
    }
  },
);
