import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  claimIntegrationOutbox,
  claimScheduledJobRun,
  clearWorkerCheckpoint,
  close,
  completeScheduledJobRun,
  connect,
  enqueueIntegrationOutbox,
  expireStaleScheduledJobRuns,
  findDueScheduledJobRuns,
  getDb,
  refreshStockIfStale,
  renewScheduledJobRunLease,
} from "../../../dist/index.js";

const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" &&
  typeof process.env.MONGODB_TEST_URI === "string" &&
  process.env.MONGODB_TEST_URI.length > 0;
const DB_NAME = "stargate_test_worker_contracts";

before(async () => {
  if (!HAS_DB) return;
  await connect({
    uri: process.env.MONGODB_TEST_URI,
    dbName: DB_NAME,
    maxPoolSize: 20,
  });
  const db = await getDb();
  await Promise.all([
    db.collection("scheduled_job_runs").deleteMany({}),
    db.collection("integration_outbox").deleteMany({}),
    db.collection("shop_daily_stock").deleteMany({}),
    db
      .collection("scheduled_job_runs")
      .createIndex(
        { jobName: 1, slotKey: 1 },
        { unique: true, name: "scheduled_job_runs_job_slot_unique" },
      ),
    db
      .collection("integration_outbox")
      .createIndex(
        { dedupeKey: 1 },
        { unique: true, name: "integration_outbox_dedupeKey_unique" },
      ),
    db
      .collection("shop_daily_stock")
      .createIndex(
        { itemId: 1 },
        { unique: true, name: "shop_daily_stock_itemId_unique" },
      ),
  ]);
});

after(async () => {
  if (!HAS_DB) return;
  const db = await getDb();
  await db.dropDatabase();
  await close();
});

test(
  "동일 slot의 100개 동시 claim은 하나만 성공한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const claims = await Promise.all(
      Array.from({ length: 100 }, () =>
        claimScheduledJobRun({
          jobName: "stocks.tick",
          slotKey: "2099-01-01",
        }),
      ),
    );
    const winners = claims.filter(Boolean);
    assert.equal(winners.length, 1);
    assert.ok(winners[0]?._id);
    assert.ok(winners[0]?.leaseToken);
    assert.equal(
      await completeScheduledJobRun({
        id: winners[0]._id,
        leaseToken: winners[0].leaseToken,
      }),
      true,
    );
  },
);

test(
  "동일 dedupeKey의 outbox enqueue는 한 문서만 만든다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const events = await Promise.all(
      Array.from({ length: 50 }, () =>
        enqueueIntegrationOutbox({
          kind: "GM_ADMIN_AUDIT",
          dedupeKey: "test:audit:1",
          payload: { action: "test" },
          availableAt: new Date("2199-01-01T00:00:00.000Z"),
        }),
      ),
    );
    assert.equal(
      new Set(events.map((event) => String(event._id))).size,
      1,
    );
    const db = await getDb();
    assert.equal(
      await db
        .collection("integration_outbox")
        .countDocuments({ dedupeKey: "test:audit:1" }),
      1,
    );
  },
);

test(
  "scheduled final-attempt crash는 lease 만료 후 다음 claim에서 원자적으로 DEAD 전이된다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const claimedAt = new Date("2099-01-02T00:00:00.000Z");
    const first = await claimScheduledJobRun({
      jobName: "stocks.tick",
      slotKey: "2099-01-02",
      now: claimedAt,
      leaseMs: 100,
      maxAttempts: 1,
    });
    assert.ok(first?._id);

    const afterCrash = await claimScheduledJobRun({
      jobName: "stocks.tick",
      slotKey: "2099-01-02",
      now: new Date(claimedAt.getTime() + 101),
      leaseMs: 100,
      maxAttempts: 1,
    });
    assert.equal(afterCrash, null);

    const db = await getDb();
    const stored = await db.collection("scheduled_job_runs").findOne({
      jobName: "stocks.tick",
      slotKey: "2099-01-02",
    });
    assert.equal(stored?.status, "DEAD");
    assert.equal(stored?.attempts, 1);
    assert.equal(stored?.leaseToken, undefined);
    assert.ok(stored?.completedAt instanceof Date);
  },
);

test(
  "scheduled retry 조회는 backoff가 끝난 지원 작업과 만료 lease만 반환한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const now = new Date("2099-01-05T00:00:00.000Z");
    const db = await getDb();
    await db.collection("scheduled_job_runs").insertMany([
      {
        jobName: "shop.refresh",
        slotKey: "2099-01-05",
        status: "FAILED",
        attempts: 1,
        availableAt: new Date(now.getTime() - 2_000),
        startedAt: new Date(now.getTime() - 10_000),
        updatedAt: new Date(now.getTime() - 2_000),
      },
      {
        jobName: "stocks.tick",
        slotKey: "2099-01-05",
        status: "RUNNING",
        attempts: 1,
        availableAt: new Date(now.getTime() - 1_000),
        leaseUntil: new Date(now.getTime() - 500),
        startedAt: new Date(now.getTime() - 9_000),
        updatedAt: new Date(now.getTime() - 1_000),
      },
      {
        jobName: "credits.daily-allowance",
        slotKey: "2099-01-05",
        status: "FAILED",
        attempts: 1,
        availableAt: new Date(now.getTime() + 1_000),
        startedAt: new Date(now.getTime() - 8_000),
        updatedAt: now,
      },
      {
        jobName: "sessions.erp-reminders",
        slotKey: "2099-01-05",
        status: "FAILED",
        attempts: 8,
        availableAt: new Date(now.getTime() - 1_000),
        startedAt: new Date(now.getTime() - 7_000),
        updatedAt: now,
      },
    ]);

    const runs = await findDueScheduledJobRuns({
      now,
      maxAttempts: 8,
      jobNames: [
        "shop.refresh",
        "stocks.tick",
        "credits.daily-allowance",
        "sessions.erp-reminders",
      ],
    });

    assert.deepEqual(
      runs.map((run) => run.jobName),
      ["shop.refresh", "stocks.tick"],
    );

    assert.equal(
      await expireStaleScheduledJobRuns({
        currentSlotKey: "2099-01-06",
        now: new Date("2099-01-06T00:00:00.000Z"),
        jobNames: [
          "shop.refresh",
          "stocks.tick",
          "credits.daily-allowance",
          "sessions.erp-reminders",
        ],
      }),
      4,
    );
    assert.equal(
      await db.collection("scheduled_job_runs").countDocuments({
        slotKey: "2099-01-05",
        status: "DEAD",
      }),
      4,
    );
  },
);

test(
  "과거 shop refresh는 더 최신 날짜의 재고를 덮지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    assert.equal(
      await refreshStockIfStale("test-monotonic-item", 5, "2099-01-02"),
      true,
    );
    assert.equal(
      await refreshStockIfStale("test-monotonic-item", 99, "2099-01-01"),
      false,
    );

    const db = await getDb();
    const stored = await db.collection("shop_daily_stock").findOne({
      itemId: "test-monotonic-item",
    });
    assert.equal(stored?.stock, 5);
    assert.equal(stored?.lastRefresh, "2099-01-02");
  },
);

test(
  "outbox final-attempt crash는 lease 만료 후 다음 claim에서 DEAD가 되고 재claim되지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const claimedAt = new Date("2099-01-03T00:00:00.000Z");
    const event = await enqueueIntegrationOutbox({
      kind: "GM_ADMIN_AUDIT",
      dedupeKey: "test:audit:final-attempt-crash",
      payload: { action: "crash" },
      availableAt: claimedAt,
    });
    const first = await claimIntegrationOutbox({
      now: claimedAt,
      leaseMs: 100,
      maxAttempts: 1,
    });
    assert.equal(String(first?._id), String(event._id));
    assert.equal(first?.attempts, 1);

    const afterCrash = await claimIntegrationOutbox({
      now: new Date(claimedAt.getTime() + 101),
      leaseMs: 100,
      maxAttempts: 1,
    });
    assert.equal(afterCrash, null);

    const db = await getDb();
    const stored = await db.collection("integration_outbox").findOne({
      dedupeKey: "test:audit:final-attempt-crash",
    });
    assert.equal(stored?.status, "DEAD");
    assert.equal(stored?.attempts, 1);
    assert.equal(stored?.leaseToken, undefined);
    assert.ok(stored?.deadAt instanceof Date);
  },
);

test(
  "scheduled lease 갱신과 완료는 현재 fencing token과 만료 전 lease를 요구한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const claimedAt = new Date("2099-01-04T00:00:00.000Z");
    const run = await claimScheduledJobRun({
      jobName: "shop.refresh",
      slotKey: "2099-01-04",
      now: claimedAt,
      leaseMs: 1_000,
    });
    assert.ok(run?._id);
    assert.ok(run?.leaseToken);

    assert.equal(
      await renewScheduledJobRunLease({
        id: run._id,
        leaseToken: "stale-token",
        now: new Date(claimedAt.getTime() + 100),
        leaseMs: 1_000,
      }),
      null,
    );
    const renewedUntil = await renewScheduledJobRunLease({
      id: run._id,
      leaseToken: run.leaseToken,
      now: new Date(claimedAt.getTime() + 100),
      leaseMs: 1_000,
    });
    assert.equal(
      renewedUntil?.toISOString(),
      new Date(claimedAt.getTime() + 1_100).toISOString(),
    );
    assert.equal(
      await completeScheduledJobRun({
        id: run._id,
        leaseToken: "stale-token",
        now: new Date(claimedAt.getTime() + 200),
      }),
      false,
    );
    assert.equal(
      await completeScheduledJobRun({
        id: run._id,
        leaseToken: run.leaseToken,
        now: new Date(claimedAt.getTime() + 200),
      }),
      true,
    );
  },
);

test(
  "checkpoint 정리 API는 없는 문서에도 멱등이다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    assert.equal(await clearWorkerCheckpoint("missing"), false);
  },
);
