import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_nochichim_character_race_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);

let ObjectId;
let characterId;
let equipCharacterInventoryItem;
let equipmentSlotLockId;
let findTransactionalAgentCharacterByKey;
let getClient;
let getDb;
let lockCharacterInventoryItems;
let prepareCharacterInventoryItemLocks;

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  const sharedDb = await import("@stargate/shared-db");
  sharedDb.initServerless({
    uri: TEST_URI,
    dbName: TEST_DB_NAME,
    maxPoolSize: 5,
  });
  ({
    equipCharacterInventoryItem,
    equipmentSlotLockId,
    getClient,
    getDb,
    lockCharacterInventoryItems,
    prepareCharacterInventoryItemLocks,
  } = sharedDb);
  ({ findTransactionalAgentCharacterByKey } = await import(
    "../_lib/transactional-character.ts"
  ));

  characterId = new ObjectId();
  await (await getDb()).collection("characters").insertOne({
    _id: characterId,
    codename: "RACE-TEST-AGENT",
    type: "AGENT",
  });
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  await (await getDb()).dropDatabase();
  await (await getClient()).close();
});

test(
  "preflight 뒤 타입 변경 또는 삭제된 캐릭터는 mutation transaction에서 거절한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const db = await getDb();
    const characters = db.collection("characters");
    assert.ok(
      await characters.findOne({ _id: characterId, type: "AGENT" }),
      "preflight must initially resolve the AGENT",
    );

    await characters.updateOne(
      { _id: characterId },
      { $set: { type: "NPC" } },
    );
    const typeChangedSession = (await getClient()).startSession();
    try {
      let resolved;
      await typeChangedSession.withTransaction(async () => {
        resolved = await findTransactionalAgentCharacterByKey(
          String(characterId),
          typeChangedSession,
        );
      });
      assert.equal(resolved, null);
    } finally {
      await typeChangedSession.endSession();
    }

    await characters.updateOne(
      { _id: characterId },
      { $set: { type: "AGENT" } },
    );
    assert.ok(await characters.findOne({ _id: characterId, type: "AGENT" }));
    await characters.deleteOne({ _id: characterId });
    const deletedSession = (await getClient()).startSession();
    try {
      let resolved;
      await deletedSession.withTransaction(async () => {
        resolved = await findTransactionalAgentCharacterByKey(
          "RACE-TEST-AGENT",
          deletedSession,
        );
      });
      assert.equal(resolved, null);
    } finally {
      await deletedSession.endSession();
    }
  },
);

test(
  "U2의 WEAPON 슬롯 잠금은 동시 무기 교체를 승인·탄환 소비 뒤까지 직렬화한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const db = await getDb();
    const inventory = db.collection("character_inventory");
    const lockCharacterId = new ObjectId().toString();
    const firstItemId = new ObjectId().toString();
    const secondItemId = new ObjectId().toString();
    const slotLockId = equipmentSlotLockId("WEAPON");
    const now = new Date();

    await inventory.insertMany([
      {
        characterId: lockCharacterId,
        itemId: firstItemId,
        itemName: "피안의 보루",
        quantity: 1,
        equippedSlot: "WEAPON",
        equippedAt: now,
        acquiredAt: now,
      },
      {
        characterId: lockCharacterId,
        itemId: secondItemId,
        itemName: "교체 무기",
        quantity: 1,
        acquiredAt: now,
      },
    ]);
    await prepareCharacterInventoryItemLocks(lockCharacterId, [
      firstItemId,
      secondItemId,
      slotLockId,
    ]);

    const session = (await getClient()).startSession();
    let releaseSlotLock;
    const slotLockHeld = new Promise((resolve) => {
      releaseSlotLock = resolve;
    });
    let confirmSlotLock;
    const slotLockAcquired = new Promise((resolve) => {
      confirmSlotLock = resolve;
    });

    try {
      const u2Transaction = session.withTransaction(async () => {
        await lockCharacterInventoryItems(
          lockCharacterId,
          [firstItemId, slotLockId],
          session,
        );
        const equipped = await inventory.findOne(
          {
            characterId: lockCharacterId,
            itemId: firstItemId,
            equippedSlot: "WEAPON",
          },
          { session },
        );
        assert.ok(equipped, "U2 precondition must observe Pian Bulwark equipped");
        confirmSlotLock();
        await slotLockHeld;
      });
      await slotLockAcquired;

      const swap = equipCharacterInventoryItem(
        lockCharacterId,
        secondItemId,
        "WEAPON",
      );
      const earlyResult = await Promise.race([
        swap.then(() => "swapped"),
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 100)),
      ]);
      assert.equal(
        earlyResult,
        "blocked",
        "동시 무기 교체는 U2 슬롯 잠금이 풀리기 전에 commit되면 안 된다",
      );

      releaseSlotLock();
      await u2Transaction;
      const swapResult = await swap;
      assert.equal(swapResult.ok, true);
      assert.equal(
        (await inventory.findOne({
          characterId: lockCharacterId,
          itemId: secondItemId,
        }))?.equippedSlot,
        "WEAPON",
      );
    } finally {
      releaseSlotLock?.();
      await session.endSession();
      await inventory.deleteMany({ characterId: lockCharacterId });
      await db
        .collection("character_inventory_locks")
        .deleteMany({ characterId: lockCharacterId });
    }
  },
);
