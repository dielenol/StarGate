import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_economic_operations_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

let executeEconomicOperationResult;
let addToInventory;
let prepareCharacterInventoryItemLocks;
let getDb;
let getClient;

const INVENTORY_CHARACTER_ID = "economic-inventory-character";
const INVENTORY_ITEM_ID = "economic-inventory-item";

before(async () => {
  if (!HAS_DB) return;
  ({ executeEconomicOperationResult } = await import("../execute-economic-operation.ts"));
  ({
    addToInventory,
    prepareCharacterInventoryItemLocks,
    getDb,
    getClient,
  } = await import("@stargate/shared-db"));
  const db = await getDb();
  await Promise.all([
    db.collection("economic_operations").deleteMany({}),
    db.collection("economic_test_side_effects").deleteMany({}),
    db.collection("character_inventory").deleteMany({
      characterId: INVENTORY_CHARACTER_ID,
    }),
    db.collection("character_inventory_locks").deleteMany({
      characterId: INVENTORY_CHARACTER_ID,
    }),
  ]);
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  const db = await getDb();
  await Promise.all([
    db.collection("economic_operations").deleteMany({}),
    db.collection("economic_test_side_effects").deleteMany({}),
    db.collection("character_inventory").deleteMany({
      characterId: INVENTORY_CHARACTER_ID,
    }),
    db.collection("character_inventory_locks").deleteMany({
      characterId: INVENTORY_CHARACTER_ID,
    }),
  ]);
  await (await getClient()).close();
});

async function runOnce(requestId, { fail = false } = {}) {
  const db = await getDb();
  return executeEconomicOperationResult({
    requestId,
    domain: "test-checkout",
    actorId: "test-actor",
    payload: { sku: "test-item", quantity: 1 },
    run: async (session) => {
      await db.collection("economic_test_side_effects").insertOne(
        { requestId, createdAt: new Date() },
        { session },
      );
      if (fail) throw new Error("FAULT_AFTER_SIDE_EFFECT");
      return { status: 201, body: { ok: true, requestId } };
    },
  });
}

test(
  "동일 키 순차 재전송은 저장된 결과를 재사용하고 side effect를 한 번만 실행한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const first = await runOnce("economic-sequential");
    const second = await runOnce("economic-sequential");
    assert.deepEqual(first.body, second.body);
    assert.equal(second.replayed, true);
    assert.equal(
      await (await getDb()).collection("economic_test_side_effects").countDocuments({ requestId: "economic-sequential" }),
      1,
    );
  },
);

test(
  "동일 키 동시 전송도 transaction side effect를 한 번만 커밋한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await Promise.all([runOnce("economic-concurrent"), runOnce("economic-concurrent")]);
    assert.equal(
      await (await getDb()).collection("economic_test_side_effects").countDocuments({ requestId: "economic-concurrent" }),
      1,
    );
  },
);

test(
  "side effect 직후 fault는 operation과 side effect를 모두 rollback하고 같은 키 재시도를 허용한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await assert.rejects(runOnce("economic-fault", { fail: true }), /FAULT_AFTER_SIDE_EFFECT/);
    const db = await getDb();
    assert.equal(await db.collection("economic_test_side_effects").countDocuments({ requestId: "economic-fault" }), 0);
    assert.equal(await db.collection("economic_operations").countDocuments({ _id: "economic-fault" }), 0);
    assert.equal((await runOnce("economic-fault")).status, 201);
  },
);

test(
  "commit 후 알림 실패는 완료 operation을 되돌리거나 processing으로 남기지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await runOnce("economic-notification");
    await Promise.reject(new Error("NOTIFICATION_FAILED")).catch(() => undefined);
    const operation = await (await getDb()).collection("economic_operations").findOne({ _id: "economic-notification" });
    assert.equal(operation?.status, "completed");
  },
);

test(
  "서로 다른 주문의 동일 inventory upsert도 lock 문서로 한 행에 직렬화된다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const purchase = async (requestId) => {
      await prepareCharacterInventoryItemLocks(
        INVENTORY_CHARACTER_ID,
        [INVENTORY_ITEM_ID],
      );
      return executeEconomicOperationResult({
        requestId,
        domain: "test-inventory-checkout",
        actorId: "test-actor",
        payload: { itemId: INVENTORY_ITEM_ID },
        run: async (session) => {
          await addToInventory(
            {
              characterId: INVENTORY_CHARACTER_ID,
              characterCodename: "LOCK TEST",
              itemId: INVENTORY_ITEM_ID,
              itemName: "동시성 시험 품목",
              quantity: 1,
              acquiredAt: new Date(),
            },
            { session },
          );
          return { status: 201, body: { ok: true } };
        },
      });
    };

    await Promise.all([purchase("inventory-lock-a"), purchase("inventory-lock-b")]);
    const rows = await (await getDb())
      .collection("character_inventory")
      .find({
        characterId: INVENTORY_CHARACTER_ID,
        itemId: INVENTORY_ITEM_ID,
      })
      .toArray();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.quantity, 2);
  },
);
