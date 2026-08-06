import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_zulu_sample_lab_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

let ObjectId;
let executeEconomicOperationResult;
let extractZuluSample;
let getClient;
let getDb;
let unlockZuluSampleLine;

const ids = {};

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  ({ executeEconomicOperationResult } = await import(
    "../execute-economic-operation.ts"
  ));
  ({ extractZuluSample, unlockZuluSampleLine } = await import(
    "../zulu-sample-lab.ts"
  ));
  ({ getClient, getDb } = await import("@stargate/shared-db"));

  ids.gm = new ObjectId();
  ids.player = new ObjectId();
  ids.character = new ObjectId();
  ids.source = new ObjectId();
  ids.sample = new ObjectId();
  const now = new Date("2026-08-05T00:00:00.000Z");
  const db = await getDb();
  await Promise.all([
    db.collection("users").insertMany([
      {
        _id: ids.gm,
        displayName: "TEST GM",
        discordUsername: null,
        role: "GM",
        status: "ACTIVE",
      },
      {
        _id: ids.player,
        displayName: "TEST PLAYER",
        discordUsername: "test-player",
        role: "U",
        status: "ACTIVE",
      },
    ]),
    db.collection("characters").insertOne({
      _id: ids.character,
      codename: "TEST-AGENT",
      ownerId: String(ids.player),
      type: "AGENT",
      tier: "MAIN",
    }),
    db.collection("master_items").insertMany([
      {
        _id: ids.source,
        slug: "zulu-0028-contained-entity",
        name: "ZULU-0028 격리 개체",
        category: "SPECIAL",
        description: "test",
        price: 0,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: ids.sample,
        slug: "broken-syllable",
        name: "깨진 음절",
        category: "MATERIAL",
        description: "test",
        price: 0,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      },
    ]),
    db.collection("shared_inventory").insertOne({
      scope: "GLOBAL",
      itemId: String(ids.source),
      itemName: "ZULU-0028 격리 개체",
      quantity: 1,
      acquiredAt: now,
    }),
    db.collection("credit_balances").insertOne({
      characterId: String(ids.character),
      balance: 1_000,
      updatedAt: now,
    }),
  ]);
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  await (await getDb()).dropDatabase();
  await (await getClient()).close();
});

async function unlock(requestId) {
  return executeEconomicOperationResult({
    requestId,
    domain: "test-zulu-sample-line-unlock",
    actorId: String(ids.gm),
    payload: { lineId: "ZULU-0028" },
    run: async (session) => ({
      status: 201,
      body: await unlockZuluSampleLine({
        actor: { id: String(ids.gm), displayName: "TEST GM" },
        requestId,
        session,
      }),
    }),
  });
}

async function extract(requestId) {
  return executeEconomicOperationResult({
    requestId,
    domain: "test-zulu-sample-extraction",
    actorId: String(ids.player),
    payload: {
      lineId: "ZULU-0028",
      characterId: String(ids.character),
    },
    run: async (session) => ({
      status: 201,
      body: await extractZuluSample({
        actor: { id: String(ids.player), displayName: "TEST PLAYER" },
        expectedCharacter: {
          id: String(ids.character),
          codename: "TEST-AGENT",
        },
        requestId,
        session,
      }),
    }),
  });
}

test(
  "최초 제출과 재생은 격리 개체를 한 번만 차감하고 샘플을 한 번만 지급한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const first = await unlock("zulu-test-unlock");
    const replay = await unlock("zulu-test-unlock");
    const db = await getDb();
    const source = await db.collection("shared_inventory").findOne({
      scope: "GLOBAL",
      itemId: String(ids.source),
    });
    const sample = await db.collection("shared_inventory").findOne({
      scope: "GLOBAL",
      itemId: String(ids.sample),
    });

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(source, null);
    assert.equal(sample?.quantity, 1);
    assert.equal(
      await db.collection("zulu_sample_lines").countDocuments({}),
      1,
    );
  },
);

test(
  "추출은 500 CR PURCHASE와 공용 샘플 지급을 함께 커밋하고 재생 시 중복 처리하지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const first = await extract("zulu-test-extract");
    const replay = await extract("zulu-test-extract");
    const db = await getDb();
    const balance = await db.collection("credit_balances").findOne({
      characterId: String(ids.character),
    });
    const ledger = await db.collection("credit_transactions").find({
      requestId: "zulu-test-extract",
      type: "PURCHASE",
    }).toArray();
    const sample = await db.collection("shared_inventory").findOne({
      scope: "GLOBAL",
      itemId: String(ids.sample),
    });

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(balance?.balance, 500);
    assert.equal(ledger.length, 1);
    assert.equal(sample?.quantity, 2);
  },
);

test(
  "남은 500 CR에 대한 동시 추출 두 건 중 하나만 커밋한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const results = await Promise.allSettled([
      extract("zulu-test-concurrent-a"),
      extract("zulu-test-concurrent-b"),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter((result) => result.status === "rejected").length,
      1,
    );

    const db = await getDb();
    const balance = await db.collection("credit_balances").findOne({
      characterId: String(ids.character),
    });
    const sample = await db.collection("shared_inventory").findOne({
      scope: "GLOBAL",
      itemId: String(ids.sample),
    });
    assert.equal(balance?.balance, 0);
    assert.equal(sample?.quantity, 3);
  },
);
