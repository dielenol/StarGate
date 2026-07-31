import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_soda_daily_limit_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

const FIXED_PURCHASE_AT = new Date("2026-07-31T12:00:00.000Z");

let createMrBeastSodaDailyPurchaseKey;
let executeEconomicOperationResult;
let incrementMrBeastSodaDailyPurchaseCounter;
let prepareMrBeastSodaDailyPurchaseCounter;
let getClient;
let getDb;

before(async () => {
  if (!HAS_DB) return;
  ({
    createMrBeastSodaDailyPurchaseKey,
  } = await import("../../shop/mrbeast-soda-daily-limit.ts"));
  ({
    incrementMrBeastSodaDailyPurchaseCounter,
    prepareMrBeastSodaDailyPurchaseCounter,
  } = await import("../mrbeast-soda-daily-limit.ts"));
  ({ executeEconomicOperationResult } = await import(
    "../execute-economic-operation.ts"
  ));
  ({ getClient, getDb } = await import("@stargate/shared-db"));
  const db = await getDb();
  await Promise.all([
    db.collection("shop_daily_purchase_counters").deleteMany({}),
    db.collection("economic_operations").deleteMany({}),
    db.collection("soda_daily_limit_test_side_effects").deleteMany({}),
  ]);
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  const db = await getDb();
  await Promise.all([
    db.collection("shop_daily_purchase_counters").deleteMany({}),
    db.collection("economic_operations").deleteMany({}),
    db.collection("soda_daily_limit_test_side_effects").deleteMany({}),
  ]);
  await (await getClient()).close();
});

async function purchase({
  requestId,
  userId,
  quantity,
  failAfterIncrement = false,
}) {
  const key = createMrBeastSodaDailyPurchaseKey({
    userId,
    slug: "mrbeast_soda",
    purchasedAt: FIXED_PURCHASE_AT,
  });
  await prepareMrBeastSodaDailyPurchaseCounter(key);
  return executeEconomicOperationResult({
    requestId,
    domain: "test-soda-daily-limit",
    actorId: userId,
    payload: { quantity },
    run: async (session) => {
      await incrementMrBeastSodaDailyPurchaseCounter({
        key,
        quantity,
        session,
      });
      await (await getDb())
        .collection("soda_daily_limit_test_side_effects")
        .insertOne({ requestId, quantity }, { session });
      if (failAfterIncrement) throw new Error("FAULT_AFTER_DAILY_INCREMENT");
      return { status: 201, body: { ok: true, quantity } };
    },
  });
}

async function readCounter(userId) {
  return (await getDb()).collection("shop_daily_purchase_counters").findOne({
    userId,
    slug: "mrbeast_soda",
    kstDate: "2026-07-31",
  });
}

test(
  "여러 주문 합계 10은 커밋하고 11번째 수량은 거절한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await purchase({
      requestId: "soda-aggregate-9",
      userId: "aggregate-user",
      quantity: 9,
    });
    await purchase({
      requestId: "soda-aggregate-10",
      userId: "aggregate-user",
      quantity: 1,
    });
    await assert.rejects(
      purchase({
        requestId: "soda-aggregate-11",
        userId: "aggregate-user",
        quantity: 1,
      }),
      /하루 최대 10개/,
    );
    assert.equal((await readCounter("aggregate-user"))?.purchasedQuantity, 10);
  },
);

test(
  "9개 이후 동시 1개 주문 두 건 중 하나만 커밋한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await purchase({
      requestId: "soda-concurrent-9",
      userId: "concurrent-user",
      quantity: 9,
    });
    const results = await Promise.allSettled([
      purchase({
        requestId: "soda-concurrent-a",
        userId: "concurrent-user",
        quantity: 1,
      }),
      purchase({
        requestId: "soda-concurrent-b",
        userId: "concurrent-user",
        quantity: 1,
      }),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );
    assert.equal((await readCounter("concurrent-user"))?.purchasedQuantity, 10);
  },
);

test(
  "transaction 실패는 counter와 다른 side effect를 함께 rollback한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await assert.rejects(
      purchase({
        requestId: "soda-rollback",
        userId: "rollback-user",
        quantity: 4,
        failAfterIncrement: true,
      }),
      /FAULT_AFTER_DAILY_INCREMENT/,
    );
    assert.equal((await readCounter("rollback-user"))?.purchasedQuantity, 0);
    assert.equal(
      await (await getDb())
        .collection("soda_daily_limit_test_side_effects")
        .countDocuments({ requestId: "soda-rollback" }),
      0,
    );
  },
);

test(
  "동일 Idempotency-Key 재생은 counter를 중복 증가시키지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const first = await purchase({
      requestId: "soda-idempotent",
      userId: "idempotent-user",
      quantity: 3,
    });
    const replay = await purchase({
      requestId: "soda-idempotent",
      userId: "idempotent-user",
      quantity: 3,
    });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal((await readCounter("idempotent-user"))?.purchasedQuantity, 3);
  },
);
