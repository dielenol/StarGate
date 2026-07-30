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
const HEAVY_LICENSE_SLUG = "towaski-license-heavy-weapon";
let claimTowaskiLicenseChallengeRedemption;
let activateTowaskiLicenseChallengeStep;
let getTowaskiLicenseQualificationStatus;
let grantTowaskiLicenseOnce;
let markTowaskiLicenseChallengeRedeemed;
let prepareTowaskiLicenseGrant;
let resolveTowaskiLicenseChallengeRound;
let resolveTowaskiLicenseChallengeStep;
let startOrResumeTowaskiLicenseChallenge;
let getClient;
let getDb;
let ObjectId;

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  ({ getClient, getDb } = await import("@stargate/shared-db"));
  ({
    activateTowaskiLicenseChallengeStep,
    claimTowaskiLicenseChallengeRedemption,
    markTowaskiLicenseChallengeRedeemed,
    resolveTowaskiLicenseChallengeRound,
    resolveTowaskiLicenseChallengeStep,
    startOrResumeTowaskiLicenseChallenge,
  } = await import("../equipment-license-tests.ts"));
  ({
    getTowaskiLicenseQualificationStatus,
    grantTowaskiLicenseOnce,
    prepareTowaskiLicenseGrant,
  } = await import("../equipment-licenses.ts"));
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
  await db.collection("master_items").insertMany([
    {
      slug: LICENSE_SLUG,
      name: "기본 화기 라이선스",
      category: "SPECIAL",
      isAvailable: true,
    },
    {
      slug: HEAVY_LICENSE_SLUG,
      name: "중화기 라이선스",
      category: "SPECIAL",
      isAvailable: true,
    },
  ]);
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
          programVersion: 1,
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
  "v2 단계 재전송은 동일 진행도를 반환하고 모드·버전을 challenge에 고정한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const challenge = await startOrResumeTowaskiLicenseChallenge({
      userId: "license-v2-user",
      characterId: "license-v2-character",
      characterCodename: "V2",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 2,
      mode: "firearm",
      requestId: "license-v2-start",
    });
    assert.equal(challenge.programVersion, 2);
    assert.equal(challenge.mode, "firearm");
    assert.equal(challenge.v2?.programVersion, 2);

    await new Promise((resolve) => setTimeout(resolve, 150));
    const scenario = challenge.v2.scenarios[0];
    const request = {
      challengeId: String(challenge._id),
      userId: challenge.userId,
      characterId: challenge.characterId,
      step: 0,
      input: {
        mode: "firearm",
        targetId: scenario.id,
        fired: true,
        shots: 1,
      },
      requestId: "license-v2-resolve",
    };
    const first = await resolveTowaskiLicenseChallengeStep(request);
    const replay = await resolveTowaskiLicenseChallengeStep(request);

    assert.equal(first.v2.progress.step, 1);
    assert.equal(replay.v2.progress.step, 1);
    assert.deepEqual(replay.v2.progress, first.v2.progress);
  },
);

test(
  "V3 시작은 active V2만 supersede하고 passed V2는 기존 redemption 대상으로 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const db = await getDb();
    const activeV2 = await startOrResumeTowaskiLicenseChallenge({
      userId: "license-v3-upgrade-user",
      characterId: "license-v3-upgrade-character",
      characterCodename: "V3-UPGRADE",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 2,
      mode: "firearm",
      requestId: "license-v3-upgrade-v2-start",
    });
    const activeV3 = await startOrResumeTowaskiLicenseChallenge({
      userId: activeV2.userId,
      characterId: activeV2.characterId,
      characterCodename: activeV2.characterCodename,
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 3,
      mode: "firearm",
      requestId: "license-v3-upgrade-v3-start",
    });
    const superseded = await db
      .collection("equipment_license_tests")
      .findOne({ _id: activeV2._id });
    assert.equal(superseded.status, "superseded");
    assert.equal(activeV3.status, "active");
    assert.equal(activeV3.programVersion, 3);
    assert.equal(activeV3.v3?.programVersion, 3);
    const supersededReplay = await startOrResumeTowaskiLicenseChallenge({
      userId: activeV2.userId,
      characterId: activeV2.characterId,
      characterCodename: activeV2.characterCodename,
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 2,
      mode: "firearm",
      requestId: "license-v3-upgrade-v2-start",
    });
    assert.equal(supersededReplay.status, "superseded");

    await Promise.all([
      db.collection("equipment_license_tests").updateOne(
        { _id: activeV3._id },
        { $set: { status: "failed", completedAt: new Date() } },
      ),
      db.collection("equipment_license_tests").updateOne(
        { _id: activeV2._id },
        {
          $set: {
            status: "passed",
            completedAt: new Date(),
            currentRound: 12,
            "v2.progress": {
              mode: "firearm",
              step: 12,
              hostileHits: 10,
              civilianHits: 0,
              shots: 10,
            },
          },
        },
      ),
    ]);
    const passedReplay = await startOrResumeTowaskiLicenseChallenge({
      userId: activeV2.userId,
      characterId: activeV2.characterId,
      characterCodename: activeV2.characterCodename,
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 2,
      mode: "firearm",
      requestId: "license-v3-upgrade-v2-start",
    });
    assert.equal(passedReplay.status, "passed");
    const replayablePassed = await startOrResumeTowaskiLicenseChallenge({
      userId: activeV3.userId,
      characterId: activeV3.characterId,
      characterCodename: activeV3.characterCodename,
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 3,
      mode: "firearm",
      requestId: "license-v3-passed-redemption-start",
    });
    assert.equal(String(replayablePassed._id), String(activeV2._id));
    assert.equal(replayablePassed.status, "passed");
    assert.equal(replayablePassed.programVersion, 2);
  },
);

test(
  "V3 단계 시간은 한 번만 활성화되고 요청 도착 시각과 종료 상태 재전송을 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const challenge = await startOrResumeTowaskiLicenseChallenge({
      userId: "license-v3-clock-user",
      characterId: "license-v3-clock-character",
      characterCodename: "V3-CLOCK",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 3,
      mode: "firearm",
      requestId: "license-v3-clock-start",
    });
    const activationInput = {
      challengeId: String(challenge._id),
      userId: challenge.userId,
      characterId: challenge.characterId,
      step: 0,
    };
    const activated = await activateTowaskiLicenseChallengeStep(
      activationInput,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const activationReplay = await activateTowaskiLicenseChallengeStep(
      activationInput,
    );

    assert.equal(activated.v3ActivatedStep, 0);
    assert.equal(
      activationReplay.roundStartedAt.getTime(),
      activated.roundStartedAt.getTime(),
    );

    const delayedRoundStartedAt = new Date(Date.now() - 5_000);
    const requestReceivedAt = new Date(
      delayedRoundStartedAt.getTime() + 150,
    );
    const db = await getDb();
    await db.collection("equipment_license_tests").updateOne(
      { _id: challenge._id },
      { $set: { roundStartedAt: delayedRoundStartedAt } },
    );
    const request = {
      ...activationInput,
      input: {
        mode: "firearm",
        fired: false,
        shots: 0,
        elapsedMs: 150,
      },
      requestId: "license-v3-clock-resolve",
      requestReceivedAt,
    };
    const resolved = await resolveTowaskiLicenseChallengeStep(request);
    assert.equal(resolved.status, "active");
    assert.equal(resolved.v3.progress.step, 1);

    const completedAt = new Date();
    await db.collection("equipment_license_tests").updateOne(
      { _id: challenge._id },
      { $set: { status: "failed", completedAt } },
    );
    const terminalReplay = await resolveTowaskiLicenseChallengeStep(request);
    assert.equal(terminalReplay.status, "failed");
    assert.deepEqual(terminalReplay.completedAt, completedAt);
  },
);

test(
  "V2 challenge는 V3 elapsed 입력을 저장소 경계에서 거부한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const challenge = await startOrResumeTowaskiLicenseChallenge({
      userId: "license-cross-version-user",
      characterId: "license-cross-version-character",
      characterCodename: "CROSS-VERSION",
      licenseSlug: LICENSE_SLUG,
      difficulty: "basic",
      programVersion: 2,
      mode: "firearm",
      requestId: "license-cross-version-start",
    });

    await assert.rejects(
      resolveTowaskiLicenseChallengeStep({
        challengeId: String(challenge._id),
        userId: challenge.userId,
        characterId: challenge.characterId,
        step: 0,
        input: {
          mode: "firearm",
          fired: false,
          shots: 0,
          elapsedMs: 150,
        },
        requestId: "license-cross-version-resolve",
        requestReceivedAt: new Date(),
      }),
      /시험 버전과 제출한 단계 입력/,
    );
  },
);

test(
  "기존 고급 자격 갱신은 취득일·메모를 보존하고 자격 메타데이터만 v2로 교체한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const db = await getDb();
    const master = await db
      .collection("master_items")
      .findOne({ slug: HEAVY_LICENSE_SLUG });
    const acquiredAt = new Date("2025-01-02T03:04:05.000Z");
    const originalNote = "기존 발급 메모";
    const characterId = "license-renewal-character";
    await db.collection("character_inventory").insertOne({
      characterId,
      characterCodename: "RENEWAL",
      itemId: String(master._id),
      itemName: master.name,
      quantity: 1,
      acquiredAt,
      note: originalNote,
      licenseQualification: {
        authority: "TOWASKI",
        programVersion: 1,
        qualifiedAt: acquiredAt,
        renewalDueAt: new Date("2025-02-01T03:04:05.000Z"),
      },
    });

    await prepareTowaskiLicenseGrant(characterId, HEAVY_LICENSE_SLUG);
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        await grantTowaskiLicenseOnce(
          {
            characterId,
            characterCodename: "RENEWAL",
            licenseSlug: HEAVY_LICENSE_SLUG,
            note: "새 메모로 덮어쓰면 안 됨",
            programVersion: 2,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const entry = await db
      .collection("character_inventory")
      .findOne({ characterId });
    assert.deepEqual(entry.acquiredAt, acquiredAt);
    assert.equal(entry.note, originalNote);
    assert.equal(entry.licenseQualification.programVersion, 2);
    assert.equal(entry.licenseQualification.renewalDueAt, undefined);
    assert.equal(
      (
        await getTowaskiLicenseQualificationStatus(
          characterId,
          HEAVY_LICENSE_SLUG,
        )
      ).state,
      "active",
    );
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
