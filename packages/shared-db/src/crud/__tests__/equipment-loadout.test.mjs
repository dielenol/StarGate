import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate_test_equipment_loadout_${process.pid}`;
const CHARACTER_ID = "equipment-loadout-character";

let close;
let equipCharacterInventoryItem;
let getDb;
let removeFromInventory;

before(async () => {
  if (!HAS_DB) return;
  const sharedDb = await import("../../../dist/index.js");
  sharedDb.initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME, maxPoolSize: 2 });
  ({
    close,
    equipCharacterInventoryItem,
    getDb,
    removeFromInventory,
  } = sharedDb);
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const db = await getDb();
  await Promise.all([
    db.collection("character_inventory").deleteMany({}),
    db.collection("character_inventory_locks").deleteMany({}),
  ]);
  await db.collection("character_inventory").insertMany([
    inventoryRow("weapon-a", "무기 A"),
    inventoryRow("weapon-b", "무기 B"),
    inventoryRow("armor-a", "방어구 A"),
  ]);
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  await (await getDb()).dropDatabase();
  await close();
});

function inventoryRow(itemId, itemName) {
  return {
    characterId: CHARACTER_ID,
    characterCodename: "LOADOUT",
    itemId,
    itemName,
    quantity: 1,
    acquiredAt: new Date(),
  };
}

test(
  "무기 교체는 방어구를 유지하고 슬롯당 한 장비만 남긴다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    assert.equal(
      (await equipCharacterInventoryItem(CHARACTER_ID, "weapon-a", "WEAPON")).ok,
      true,
    );
    assert.equal(
      (await equipCharacterInventoryItem(CHARACTER_ID, "armor-a", "ARMOR")).ok,
      true,
    );
    const replacement = await equipCharacterInventoryItem(
      CHARACTER_ID,
      "weapon-b",
      "WEAPON",
    );
    assert.equal(replacement.ok, true);
    assert.equal(replacement.previousItemId, "weapon-a");

    const rows = await (await getDb())
      .collection("character_inventory")
      .find({ characterId: CHARACTER_ID, equippedSlot: { $exists: true } })
      .sort({ equippedSlot: 1 })
      .toArray();
    assert.deepEqual(
      rows.map((row) => [row.equippedSlot, row.itemId]),
      [
        ["ARMOR", "armor-a"],
        ["WEAPON", "weapon-b"],
      ],
    );
  },
);

test(
  "미보유 품목은 현재 장비를 변경하지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await equipCharacterInventoryItem(CHARACTER_ID, "weapon-a", "WEAPON");
    const result = await equipCharacterInventoryItem(
      CHARACTER_ID,
      "missing",
      "WEAPON",
    );
    assert.deepEqual(result, { ok: false, reason: "NOT_OWNED" });
    const equipped = await (await getDb())
      .collection("character_inventory")
      .findOne({ characterId: CHARACTER_ID, equippedSlot: "WEAPON" });
    assert.equal(equipped?.itemId, "weapon-a");
  },
);

test(
  "동시 무기 교체 후에도 활성 무기는 정확히 하나다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await Promise.all([
      equipCharacterInventoryItem(CHARACTER_ID, "weapon-a", "WEAPON"),
      equipCharacterInventoryItem(CHARACTER_ID, "weapon-b", "WEAPON"),
    ]);
    const equipped = await (await getDb())
      .collection("character_inventory")
      .find({ characterId: CHARACTER_ID, equippedSlot: "WEAPON" })
      .toArray();
    assert.equal(equipped.length, 1);
    assert.ok(["weapon-a", "weapon-b"].includes(equipped[0]?.itemId));
  },
);

test(
  "장착 중인 인벤토리 수량은 제거할 수 없다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await equipCharacterInventoryItem(CHARACTER_ID, "weapon-a", "WEAPON");
    const result = await removeFromInventory(CHARACTER_ID, "weapon-a", 1);
    assert.deepEqual(result, { ok: false, remaining: 0 });
  },
);
