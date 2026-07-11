import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

const TEST_DB_NAME = `stargate_test_equipment_license_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

const LICENSE_SLUG = "towaski-license-basic-firearm";
let claimTowaskiLicenseChallengeRedemption;
let grantTowaskiLicenseOnce;
let markTowaskiLicenseChallengeRedeemed;
let prepareTowaskiLicenseGrant;
let resolveTowaskiLicenseChallengeRound;
let getClient;
let getDb;
let ObjectId;

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  ({ getClient, getDb } = await import("@stargate/shared-db"));
  ({
    claimTowaskiLicenseChallengeRedemption,
    markTowaskiLicenseChallengeRedeemed,
    resolveTowaskiLicenseChallengeRound,
  } = await import("../equipment-license-tests.ts"));
  ({ grantTowaskiLicenseOnce, prepareTowaskiLicenseGrant } = await import(
    "../equipment-licenses.ts"
  ));
});

beforeEach(async () => {
  if (!HAS_DB) return;
  const db = await getDb();
  await Promise.all([
    db.collection("equipment_license_tests").deleteMany({}),
    db.collection("equipment_license_test_requests").deleteMany({}),
    db.collection("character_inventory").deleteMany({}),
    db.collection("character_inventory_locks").deleteMany({}),
    db.collection("master_items").deleteMany({}),
  ]);
  await db.collection("master_items").insertOne({
    slug: LICENSE_SLUG,
    name: "기본 화기 라이선스",
    category: "SPECIAL",
    isAvailable: true,
  });
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  const db = await getDb();
  await Promise.all([
    db.collection("equipment_license_tests").deleteMany({}),
    db.collection("equipment_license_test_requests").deleteMany({}),
    db.collection("character_inventory").deleteMany({}),
    db.collection("character_inventory_locks").deleteMany({}),
    db.collection("master_items").deleteMany({}),
  ]);
  await (await getClient()).close();
});

async function insertPassedChallenge(characterId) {
  const now = new Date();
  const challenge = {
    _id: new ObjectId(),
    userId: `user-${characterId}`,
    characterId,
    characterCodename: `AGENT-${characterId}`,
    licenseSlug: LICENSE_SLUG,
    sequence: [],
    currentRound: 12,
    hostileHits: 10,
    civilianHits: 0,
    shots: 10,
    status: "passed",
    startedAt: new Date(now.getTime() - 10_000),
    roundStartedAt: now,
    expiresAt: new Date(now.getTime() + 120_000),
    completedAt: now,
  };
  await (await getDb()).collection("equipment_license_tests").insertOne(challenge);
  return challenge;
}

async function commitRedemption(challengeId, token, characterId) {
  await prepareTowaskiLicenseGrant(characterId, LICENSE_SLUG);
  const session = (await getClient()).startSession();
  try {
    return await session.withTransaction(async () => {
      const granted = await grantTowaskiLicenseOnce(
        {
          characterId,
          characterCodename: `AGENT-${characterId}`,
          licenseSlug: LICENSE_SLUG,
          note: "integration test",
        },
        { session },
      );
      const redeemed = await markTowaskiLicenseChallengeRedeemed(
        String(challengeId),
        token,
        { session },
      );
      assert.equal(redeemed, true);
      return granted;
    });
  } finally {
    await session.endSession();
  }
}

test(
  "동일 resolve 요청 재전송은 라운드와 사격 수를 한 번만 반영한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const now = new Date();
    const challenge = {
      _id: new ObjectId(),
      userId: "license-idempotent-user",
      characterId: "license-idempotent-character",
      characterCodename: "IDEMPOTENT",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      startRequestId: "license-start-idempotent",
      sequence: [
        { kind: "hostile", x: 50, y: 50, lane: "near" },
        { kind: "hostile", x: 60, y: 50, lane: "mid" },
        { kind: "hostile", x: 70, y: 50, lane: "far" },
      ],
      currentRound: 0,
      hostileHits: 0,
      civilianHits: 0,
      shots: 0,
      status: "active",
      startedAt: new Date(now.getTime() - 1_000),
      roundStartedAt: new Date(now.getTime() - 500),
      expiresAt: new Date(now.getTime() + 120_000),
    };
    await (await getDb()).collection("equipment_license_tests").insertOne(challenge);
    const input = {
      challengeId: String(challenge._id),
      userId: challenge.userId,
      characterId: challenge.characterId,
      round: 0,
      hit: true,
      shots: 1,
      requestId: "license-resolve-idempotent",
    };

    const first = await resolveTowaskiLicenseChallengeRound(input);
    const replay = await resolveTowaskiLicenseChallengeRound(input);
    assert.equal(first.currentRound, 1);
    assert.equal(replay.currentRound, 1);
    assert.equal(replay.hostileHits, 1);
    assert.equal(replay.shots, 1);
    await (await getDb()).collection("equipment_license_tests").updateOne(
      { _id: challenge._id },
      { $set: { roundStartedAt: new Date(Date.now() - 500) } },
    );
    const second = await resolveTowaskiLicenseChallengeRound({
      ...input,
      round: 1,
      requestId: "license-resolve-second",
    });
    const nonConsecutiveReplay = await resolveTowaskiLicenseChallengeRound(input);
    assert.equal(second.currentRound, 2);
    assert.equal(nonConsecutiveReplay.currentRound, 1);
    assert.equal(nonConsecutiveReplay.hostileHits, 1);
    assert.equal(nonConsecutiveReplay.shots, 1);
    await assert.rejects(
      resolveTowaskiLicenseChallengeRound({ ...input, round: 2 }),
      /동일한 요청 키/,
    );
  },
);

test(
  "마지막 resolve는 판정 상태와 요청 결과를 같은 transaction에 확정한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const now = new Date();
    const challenge = {
      _id: new ObjectId(),
      userId: "license-final-user",
      characterId: "license-final-character",
      characterCodename: "FINAL",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      sequence: [{ kind: "hostile", x: 50, y: 50, lane: "near" }],
      currentRound: 0,
      hostileHits: 0,
      civilianHits: 0,
      shots: 0,
      status: "active",
      startedAt: new Date(now.getTime() - 4_000),
      roundStartedAt: new Date(now.getTime() - 500),
      expiresAt: new Date(now.getTime() + 120_000),
    };
    const db = await getDb();
    await db.collection("equipment_license_tests").insertOne(challenge);

    const resolved = await resolveTowaskiLicenseChallengeRound({
      challengeId: String(challenge._id),
      userId: challenge.userId,
      characterId: challenge.characterId,
      round: 0,
      hit: true,
      shots: 1,
      requestId: "license-final-resolve",
    });
    const request = await db.collection("equipment_license_test_requests").findOne({
      userId: challenge.userId,
      characterId: challenge.characterId,
      requestId: "license-final-resolve",
    });

    assert.equal(resolved.status, "failed");
    assert.ok(resolved.completedAt instanceof Date);
    assert.equal(request?.outcome.status, "failed");
    assert.ok(request?.outcome.completedAt instanceof Date);
  },
);

test(
  "claim 뒤 crash는 만료 lease 재청구 후 라이선스를 한 번만 지급한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const characterId = "license-crash-recovery";
    const challenge = await insertPassedChallenge(characterId);
    const crashedToken = randomUUID();
    assert.equal(
      await claimTowaskiLicenseChallengeRedemption(
        String(challenge._id),
        crashedToken,
      ),
      true,
    );

    await (await getDb()).collection("equipment_license_tests").updateOne(
      { _id: challenge._id, redemptionToken: crashedToken },
      { $set: { redemptionLeaseExpiresAt: new Date(0) } },
    );
    const recoveryToken = randomUUID();
    assert.equal(
      await claimTowaskiLicenseChallengeRedemption(
        String(challenge._id),
        recoveryToken,
      ),
      true,
    );

    await commitRedemption(challenge._id, recoveryToken, characterId);
    const db = await getDb();
    const inventory = await db
      .collection("character_inventory")
      .find({ characterId })
      .toArray();
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0]?.quantity, 1);
    assert.equal(
      (await db.collection("equipment_license_tests").findOne({ _id: challenge._id }))
        ?.status,
      "redeemed",
    );
  },
);

test(
  "inventory 지급 직후 fault는 transaction을 롤백하고 재시도로 복구한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const characterId = "license-transaction-fault";
    const challenge = await insertPassedChallenge(characterId);
    const crashedToken = randomUUID();
    assert.equal(
      await claimTowaskiLicenseChallengeRedemption(
        String(challenge._id),
        crashedToken,
      ),
      true,
    );

    await prepareTowaskiLicenseGrant(characterId, LICENSE_SLUG);
    const session = (await getClient()).startSession();
    try {
      await assert.rejects(
        session.withTransaction(async () => {
          await grantTowaskiLicenseOnce(
            {
              characterId,
              characterCodename: `AGENT-${characterId}`,
              licenseSlug: LICENSE_SLUG,
              note: "integration test fault",
            },
            { session },
          );
          throw new Error("FAULT_AFTER_LICENSE_GRANT");
        }),
        /FAULT_AFTER_LICENSE_GRANT/,
      );
    } finally {
      await session.endSession();
    }

    const db = await getDb();
    assert.equal(
      await db.collection("character_inventory").countDocuments({ characterId }),
      0,
    );
    await db.collection("equipment_license_tests").updateOne(
      { _id: challenge._id, redemptionToken: crashedToken },
      { $set: { redemptionLeaseExpiresAt: new Date(0) } },
    );
    const recoveryToken = randomUUID();
    assert.equal(
      await claimTowaskiLicenseChallengeRedemption(
        String(challenge._id),
        recoveryToken,
      ),
      true,
    );
    await commitRedemption(challenge._id, recoveryToken, characterId);
    const inventory = await db
      .collection("character_inventory")
      .find({ characterId })
      .toArray();
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0]?.quantity, 1);
  },
);
