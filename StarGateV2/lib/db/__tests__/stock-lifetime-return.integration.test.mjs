import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { MongoClient, ObjectId } from "mongodb";

import { listStockLifetimeReturnCandidatesFromDb } from "../stock-lifetime-return.ts";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const DB_NAME = `stargate_test_novex_lifetime_${process.pid}`;

let client;
let db;

before(async () => {
  if (!HAS_DB) return;
  client = new MongoClient(TEST_URI);
  await client.connect();
  db = client.db(DB_NAME);
});

after(async () => {
  if (!HAS_DB) return;
  await db.dropDatabase();
  await client.close();
});

test(
  "NOVEX 누적 수익 Mongo 집계는 1,000건 초과 원장과 계정 제외 경계를 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const playerAlpha = new ObjectId();
    const playerBeta = new ObjectId();
    const gm = new ObjectId();
    const testUser = new ObjectId();
    const alphaCharacter = new ObjectId();
    const betaCharacter = new ObjectId();
    const gmCharacter = new ObjectId();
    const testCharacter = new ObjectId();
    const transferredToTestCharacter = new ObjectId();
    const npcCharacter = new ObjectId();

    await db.collection("users").insertMany([
      { _id: playerAlpha, username: "PLAYER_ALPHA", role: "U" },
      { _id: playerBeta, username: "PLAYER_BETA", role: "J" },
      { _id: gm, username: "GAME_MASTER", role: "GM" },
      { _id: testUser, username: "INTEGRATIONTEST", role: "U" },
    ]);
    await db.collection("characters").insertMany([
      {
        _id: alphaCharacter,
        codename: "LATEST-ALPHA",
        type: "AGENT",
        ownerId: String(playerAlpha),
      },
      {
        _id: betaCharacter,
        codename: "BETA",
        type: "AGENT",
        ownerId: String(playerBeta),
      },
      {
        _id: gmCharacter,
        codename: "GM-AGENT",
        type: "AGENT",
        ownerId: String(gm),
      },
      {
        _id: testCharacter,
        codename: "TEST-AGENT",
        type: "AGENT",
        ownerId: String(testUser),
      },
      {
        _id: transferredToTestCharacter,
        codename: "TRANSFERRED-TO-TEST",
        type: "AGENT",
        ownerId: String(testUser),
      },
      {
        _id: npcCharacter,
        codename: "NPC",
        type: "NPC",
        ownerId: String(playerAlpha),
      },
    ]);

    const alphaSales = Array.from({ length: 1_001 }, () => ({
      type: "STOCK_SELL",
      ownerId: String(playerAlpha),
      characterId: String(alphaCharacter),
      amount: 1,
      metadata: { profit: 1 },
    }));
    await db.collection("credit_transactions").insertMany([
      ...alphaSales,
      {
        type: "STOCK_SELL",
        ownerId: String(playerAlpha),
        characterId: String(alphaCharacter),
        amount: 1,
        metadata: { profit: -5 },
      },
      {
        type: "STOCK_DIVIDEND",
        ownerId: String(playerAlpha),
        characterId: String(alphaCharacter),
        amount: 25,
      },
      {
        type: "STOCK_SELL",
        ownerId: String(playerAlpha),
        characterId: String(alphaCharacter),
        amount: 1,
        metadata: { profit: "INVALID" },
      },
      {
        type: "STOCK_BUY",
        ownerId: String(playerAlpha),
        characterId: String(alphaCharacter),
        amount: 99_999,
      },
      {
        type: "STOCK_SELL",
        ownerId: String(playerBeta),
        characterId: String(betaCharacter),
        amount: 500,
        metadata: { profit: 500 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(gm),
        characterId: String(betaCharacter),
        amount: 9_999,
        metadata: { profit: 9_999 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(gm),
        characterId: String(gmCharacter),
        amount: 99_999,
        metadata: { profit: 99_999 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(testUser),
        characterId: String(testCharacter),
        amount: 88_888,
        metadata: { profit: 88_888 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(playerAlpha),
        characterId: String(transferredToTestCharacter),
        amount: 77_777,
        metadata: { profit: 77_777 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(playerAlpha),
        characterId: String(npcCharacter),
        amount: 66_666,
        metadata: { profit: 66_666 },
      },
      {
        type: "STOCK_SELL",
        ownerId: String(playerAlpha),
        characterId: "not-an-object-id",
        amount: 55_555,
        metadata: { profit: 55_555 },
      },
    ]);

    const candidates = await listStockLifetimeReturnCandidatesFromDb(db);
    const byCodename = new Map(
      candidates.map((candidate) => [candidate.codename, candidate]),
    );

    assert.equal(candidates.length, 2);
    assert.deepEqual(byCodename.get("LATEST-ALPHA"), {
      characterId: String(alphaCharacter),
      codename: "LATEST-ALPHA",
      totalRealizedReturn: 1_021,
      profitEventCount: 1_003,
    });
    assert.deepEqual(byCodename.get("BETA"), {
      characterId: String(betaCharacter),
      codename: "BETA",
      totalRealizedReturn: 500,
      profitEventCount: 1,
    });
  },
);
