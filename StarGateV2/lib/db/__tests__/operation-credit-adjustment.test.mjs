import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_operation_credit_adjustment_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

const POOL_ID = "test_operation_pool";
let addCreditPoolBalance;
let executeEconomicOperationResult;
let getClient;
let getDb;

before(async () => {
  if (!HAS_DB) return;
  ({ executeEconomicOperationResult } = await import(
    "../execute-economic-operation.ts"
  ));
  ({ addCreditPoolBalance, getClient, getDb } = await import(
    "@stargate/shared-db"
  ));
  const db = await getDb();
  await db.collection("credit_pools").insertOne({
    poolId: POOL_ID,
    name: "TEST OPERATION CREDIT",
    balance: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  await (await getDb()).dropDatabase();
  await (await getClient()).close();
});

function adjust(requestId, delta) {
  return executeEconomicOperationResult({
    requestId,
    domain: "test-nochichim-operation-credit-adjust",
    actorId: "test-vtt",
    payload: { poolId: POOL_ID, delta },
    run: async (session) => {
      const pool = await addCreditPoolBalance(POOL_ID, delta, {
        allowNegative: false,
        maxBalance: 9999999,
        session,
      });
      return {
        status: 200,
        body: { value: pool.balance, requestId, delta },
      };
    },
  });
}

test(
  "동일 requestId의 차감 재전송은 한 번만 반영한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const first = await adjust("operation-credit-replay", -10);
    const replay = await adjust("operation-credit-replay", -10);
    const pool = await (await getDb())
      .collection("credit_pools")
      .findOne({ poolId: POOL_ID });

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.body.value, 90);
    assert.equal(replay.body.value, 90);
    assert.equal(pool?.balance, 90);
  },
);

test(
  "서로 다른 writer의 증액과 스킬 차감은 합산 결과를 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await Promise.all([
      addCreditPoolBalance(POOL_ID, 50, { maxBalance: 9999999 }),
      adjust("operation-credit-concurrent", -10),
    ]);
    const pool = await (await getDb())
      .collection("credit_pools")
      .findOne({ poolId: POOL_ID });

    assert.equal(pool?.balance, 130);
  },
);
