import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_nochichim_character_race_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);

let ObjectId;
let characterId;
let findTransactionalAgentCharacterByKey;
let getClient;
let getDb;

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  const sharedDb = await import("@stargate/shared-db");
  sharedDb.initServerless({
    uri: TEST_URI,
    dbName: TEST_DB_NAME,
    maxPoolSize: 5,
  });
  ({ getClient, getDb } = sharedDb);
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
