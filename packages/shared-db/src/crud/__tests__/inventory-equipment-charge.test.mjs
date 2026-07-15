import { strict as assert } from "node:assert";
import { after, before, beforeEach, test } from "node:test";

import {
  characterInventoryCol,
  consumeEquippedEquipmentCharge,
  ensureAllIndexes,
  getClient,
  initServerless,
} from "../../../dist/index.js";

const TEST_DB_NAME = `stargate_test_equipment_charge_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const CHARACTER_ID = "equipment-charge-character";
const ITEM_ID = "64b64c1f4b13a06f4d0f0001";

before(async () => {
  if (!HAS_DB) return;
  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  await ensureAllIndexes();
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const inventory = await characterInventoryCol();
  await inventory.deleteMany({ characterId: CHARACTER_ID });
  await inventory.insertOne({
    characterId: CHARACTER_ID,
    characterCodename: "CHARGE_TEST",
    itemId: ITEM_ID,
    itemName: "테스트 장비",
    quantity: 1,
    acquiredAt: new Date(),
    equippedSlot: "WEAPON",
    equippedAt: new Date(),
    equipmentCharge: { current: 1, maximum: 1 },
  });
});

after(async () => {
  if (!HAS_DB) return;
  await (await characterInventoryCol()).deleteMany({ characterId: CHARACTER_ID });
  await (await getClient()).close();
});

test(
  "장비 충전은 한 번만 차감되고 0충전 중복 사용을 막는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    assert.deepEqual(
      await consumeEquippedEquipmentCharge(CHARACTER_ID, ITEM_ID, 1, 1),
      { ok: true, current: 0 },
    );
    assert.deepEqual(
      await consumeEquippedEquipmentCharge(CHARACTER_ID, ITEM_ID, 1, 1),
      { ok: false, current: 0 },
    );
  },
);

test(
  "장착 해제된 장비는 충전이 남아도 사용할 수 없다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await (await characterInventoryCol()).updateOne(
      { characterId: CHARACTER_ID, itemId: ITEM_ID },
      { $unset: { equippedSlot: "", equippedAt: "" } },
    );
    assert.deepEqual(
      await consumeEquippedEquipmentCharge(CHARACTER_ID, ITEM_ID, 1, 1),
      { ok: false, current: 0 },
    );
  },
);

test(
  "동시 사용 두 건 중 한 건만 충전을 소비한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const results = await Promise.all([
      consumeEquippedEquipmentCharge(CHARACTER_ID, ITEM_ID, 1, 1),
      consumeEquippedEquipmentCharge(CHARACTER_ID, ITEM_ID, 1, 1),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok).length, 1);
  },
);
