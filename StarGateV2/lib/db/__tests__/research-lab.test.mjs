import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const TEST_DB_NAME = `stargate_test_research_lab_${process.pid}`;
const TEST_URI = process.env.MONGODB_TEST_URI;
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
if (HAS_DB) process.env.MONGODB_URI = TEST_URI;
process.env.DB_NAME = TEST_DB_NAME;

let ObjectId;
let beginInitialResearch;
let cancelResearchJob;
let enqueueResearchJob;
let ensureResearchLabIndexes;
let getClient;
let getDb;
let claimDueResearchLabJob;
let claimResearchLabCharacterOutput;
let completeResearchLabSignal;
let processClaimedResearchLabJob;
let prepareCharacterInventoryItemLocks;
let renewResearchLabSignalLease;
let startIdleResearchLabJobs;
let appendNpcConversationMessages;
let applyNpcRelationshipChoice;
let getOrCreateNpcRelationship;
let reserveNpcConversationTurn;

const ids = {};
const now = new Date("2026-08-10T00:00:00.000Z");

before(async () => {
  if (!HAS_DB) return;
  ({ ObjectId } = await import("mongodb"));
  ({
    beginInitialResearch,
    cancelResearchJob,
    enqueueResearchJob,
  } = await import("../research-lab.ts"));
  ({
    claimDueResearchLabJob,
    claimResearchLabCharacterOutput,
    completeResearchLabSignal,
    appendNpcConversationMessages,
    applyNpcRelationshipChoice,
    ensureResearchLabIndexes,
    getClient,
    getDb,
    processClaimedResearchLabJob,
    prepareCharacterInventoryItemLocks,
    getOrCreateNpcRelationship,
    reserveNpcConversationTurn,
    renewResearchLabSignalLease,
    startIdleResearchLabJobs,
  } = await import("@stargate/shared-db"));

  ids.scientistUser = new ObjectId();
  ids.scientistCharacter = new ObjectId();
  ids.soldierUser = new ObjectId();
  ids.soldierCharacter = new ObjectId();
  ids.source = new ObjectId();
  ids.output = new ObjectId();
  const db = await getDb();
  await Promise.all([
    ensureResearchLabIndexes(db),
    db.collection("credit_transactions").createIndex(
      { requestId: 1 },
      { unique: true, partialFilterExpression: { requestId: { $type: "string" } } },
    ),
    db.collection("credit_balances").createIndex(
      { characterId: 1 },
      { unique: true },
    ),
    db.collection("shared_inventory").createIndex(
      { scope: 1, itemId: 1 },
      { unique: true },
    ),
    db.collection("character_inventory").createIndex(
      { characterId: 1, itemId: 1 },
      { unique: true },
    ),
  ]);
  await Promise.all([
    db.collection("users").insertMany([
      {
        _id: ids.scientistUser,
        displayName: "SCIENTIST USER",
        discordUsername: "scientist",
        role: "J",
        status: "ACTIVE",
      },
      {
        _id: ids.soldierUser,
        displayName: "SOLDIER USER",
        discordUsername: "soldier",
        role: "J",
        status: "ACTIVE",
      },
    ]),
    db.collection("characters").insertMany([
      {
        _id: ids.scientistCharacter,
        codename: "SCIENCE-TEST",
        ownerId: String(ids.scientistUser),
        type: "AGENT",
        tier: "MAIN",
        play: { className: "과학자" },
      },
      {
        _id: ids.soldierCharacter,
        codename: "SOLDIER-TEST",
        ownerId: String(ids.soldierUser),
        type: "AGENT",
        tier: "MAIN",
        play: { className: "군인" },
      },
    ]),
    db.collection("master_items").insertMany([
      {
        _id: ids.source,
        slug: "zulu-0028-contained-entity",
        name: "격리 개체",
        category: "SPECIAL",
      },
      {
        _id: ids.output,
        slug: "broken-syllable",
        name: "깨진 음절",
        category: "MATERIAL",
      },
    ]),
    db.collection("shared_inventory").insertOne({
      scope: "GLOBAL",
      itemId: String(ids.source),
      itemName: "격리 개체",
      quantity: 1,
      acquiredAt: now,
    }),
    db.collection("credit_balances").insertMany([
      {
        characterId: String(ids.scientistCharacter),
        balance: 1_000,
        updatedAt: now,
      },
      {
        characterId: String(ids.soldierCharacter),
        balance: 1_000,
        updatedAt: now,
      },
    ]),
  ]);
});

after(async () => {
  if (!HAS_DB || !getDb) return;
  await (await getDb()).dropDatabase();
  await (await getClient()).close();
});

async function transaction(run) {
  const session = (await getClient()).startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

test(
  "비과학자는 최초 연구를 시작할 수 없고 과학자는 24h 작업만 생성한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await assert.rejects(
      transaction((session) =>
        beginInitialResearch({
          recipeId: "ZULU_0028",
          actor: { id: String(ids.soldierUser), displayName: "SOLDIER" },
          requestId: "initial-soldier",
          session,
          now,
        }),
      ),
      (error) => error.code === "SCIENTIST_REQUIRED",
    );
    const initial = await transaction((session) =>
      beginInitialResearch({
        recipeId: "ZULU_0028",
        actor: { id: String(ids.scientistUser), displayName: "SCIENTIST" },
        requestId: "initial-scientist",
        session,
        now,
      }),
    );
    assert.equal(initial.job.status, "RUNNING");
    assert.equal(initial.job.completesAt.getTime() - now.getTime(), 24 * 60 * 60 * 1_000);
    assert.equal(
      await (await getDb()).collection("shared_inventory").countDocuments({ itemId: String(ids.output) }),
      0,
    );
  },
);

test(
  "동일 관계 장면의 서로 다른 선택지는 한 번만 점수에 반영된다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    await getOrCreateNpcRelationship({
      userId: String(ids.scientistUser),
      characterId: String(ids.scientistCharacter),
      initialScore: 0,
      now,
    });
    const choices = await Promise.all([
      applyNpcRelationshipChoice({
        userId: String(ids.scientistUser),
        characterId: String(ids.scientistCharacter),
        sceneId: "first-impression",
        choiceId: "observe",
        delta: 5,
        now,
      }),
      applyNpcRelationshipChoice({
        userId: String(ids.scientistUser),
        characterId: String(ids.scientistCharacter),
        sceneId: "first-impression",
        choiceId: "insult",
        delta: -8,
        now,
      }),
    ]);
    assert.equal(choices.filter((choice) => choice.applied).length, 1);
    const winningChoiceId = choices.find((choice) => choice.applied)?.choiceId;
    assert.ok(winningChoiceId);
    assert.deepEqual(
      new Set(choices.map((choice) => choice.choiceId)),
      new Set([winningChoiceId]),
    );
    assert.equal(
      await (await getDb()).collection("npc_relationship_events").countDocuments({
        sceneId: "first-impression",
      }),
      1,
    );
    const transferredOwnerRelationship = await getOrCreateNpcRelationship({
      userId: String(ids.soldierUser),
      characterId: String(ids.scientistCharacter),
      initialScore: -10,
      now,
    });
    assert.equal(transferredOwnerRelationship.score, -10);
    assert.equal(
      await (await getDb()).collection("npc_relationships").countDocuments({
        characterId: String(ids.scientistCharacter),
      }),
      2,
    );
  },
);

test(
  "빈 대화의 동시 reserve는 한 건만 허용하고 10회 summary pending을 append 실패 경계까지 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const concurrent = await Promise.all([
      reserveNpcConversationTurn({
        userId: String(ids.scientistUser),
        characterId: "conversation-concurrent",
        dailyUsageDate: "2026-08-10",
        now,
      }),
      reserveNpcConversationTurn({
        userId: String(ids.scientistUser),
        characterId: "conversation-concurrent",
        dailyUsageDate: "2026-08-10",
        now,
      }),
    ]);
    assert.equal(concurrent.filter((result) => result.ok).length, 1);
    assert.equal(
      concurrent.filter((result) => !result.ok && result.reason === "COOLDOWN").length,
      1,
    );

    const summaryReservations = [];
    let finalReservation;
    for (let count = 0; count < 10; count += 1) {
      const turnNow = new Date(now.getTime() + count * 100);
      const reservation = await reserveNpcConversationTurn({
        userId: String(ids.scientistUser),
        characterId: "conversation-summary",
        dailyUsageDate: "2026-08-10",
        now: turnNow,
        cooldownMs: 0,
      });
      assert.equal(reservation.ok, true);
      summaryReservations.push(reservation);
      if (!reservation.ok) continue;
      if (count === 9) {
        finalReservation = reservation;
        continue;
      }
      await appendNpcConversationMessages({
        userId: String(ids.scientistUser),
        characterId: "conversation-summary",
        dailyUsageDate: "2026-08-10",
        turnLeaseToken: reservation.turnLease.token,
        now: new Date(turnNow.getTime() + 1),
        messages: [
          { role: "user", content: `turn-${count}`, createdAt: turnNow },
          {
            role: "assistant",
            content: `reply-${count}`,
            createdAt: new Date(turnNow.getTime() + 1),
          },
        ],
      });
    }
    assert.equal(
      summaryReservations.filter(
        (reservation) => reservation.ok && reservation.summaryLease,
      ).length,
      1,
    );
    assert.ok(finalReservation?.ok);
    await appendNpcConversationMessages({
      userId: String(ids.scientistUser),
      characterId: "conversation-summary",
      dailyUsageDate: "2026-08-10",
      turnLeaseToken: finalReservation.turnLease.token,
      now: new Date(now.getTime() + 902),
      messages: Array.from({ length: 42 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index}`,
        createdAt: new Date(now.getTime() + index),
      })),
    });
    const stored = await (await getDb()).collection("npc_conversations").findOne({
      _id: `XENO:${String(ids.scientistUser)}:conversation-summary`,
    });
    assert.equal(stored?.summaryPending, true);
    assert.equal(stored?.messages.length, 40);
    assert.equal(stored?.messages[0].content, "message-2");
  },
);

test(
  "worker 완료는 공용 산출물을 한 번만 지급하고 반복 FIFO/취소 환불을 보존한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const completedAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const claimed = await claimDueResearchLabJob({ now: completedAt });
    assert.ok(claimed?.leaseToken);
    await processClaimedResearchLabJob({
      id: claimed._id,
      leaseToken: claimed.leaseToken,
      now: completedAt,
    });
    assert.equal(
      (await (await getDb()).collection("shared_inventory").findOne({ itemId: String(ids.output) }))?.quantity,
      1,
    );

    const first = await transaction((session) =>
      enqueueResearchJob({
        recipeId: "ZULU_0028",
        destination: "SHARED",
        actor: { id: String(ids.scientistUser), displayName: "SCIENTIST" },
        requestId: "repeat-first",
        session,
        now: completedAt,
      }),
    );
    const second = await transaction((session) =>
      enqueueResearchJob({
        recipeId: "ZULU_0028",
        destination: "CHARACTER",
        actor: { id: String(ids.soldierUser), displayName: "SOLDIER" },
        requestId: "repeat-second",
        session,
        now: completedAt,
      }),
    );
    const started = await startIdleResearchLabJobs(completedAt);
    assert.equal(String(started[0]._id), String(first.job._id));
    assert.equal(
      (await (await getDb()).collection("research_lab_jobs").findOne({ _id: second.job._id }))?.status,
      "QUEUED",
    );

    const cancelled = await transaction((session) =>
      cancelResearchJob({
        jobId: String(second.job._id),
        actor: { id: String(ids.soldierUser), displayName: "SOLDIER" },
        session,
        now: new Date(completedAt.getTime() + 1_000),
      }),
    );
    assert.equal(cancelled.job.status, "CANCELLED");
    assert.equal(cancelled.balance, 1_000);
    assert.equal(
      await (await getDb()).collection("credit_transactions").countDocuments({
        requestId: `research-refund:${String(second.job._id)}`,
      }),
      1,
    );

    const db = await getDb();
    const balanceBeforeHaltedRequest = (
      await db.collection("credit_balances").findOne({
        characterId: String(ids.soldierCharacter),
      })
    )?.balance;
    const haltSession = (await getClient()).startSession();
    let enqueueOutcome;
    try {
      haltSession.startTransaction();
      await db.collection("research_lab_jobs").updateOne(
        { _id: first.job._id },
        { $set: { workerHaltedAt: new Date(completedAt.getTime() + 2_000) } },
        { session: haltSession },
      );
      const enqueueAttempt = transaction((session) =>
        enqueueResearchJob({
          recipeId: "ZULU_0028",
          destination: "SHARED",
          actor: { id: String(ids.soldierUser), displayName: "SOLDIER" },
          requestId: "repeat-halted",
          session,
          now: new Date(completedAt.getTime() + 3_000),
        }),
      ).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      let enqueueSettled = false;
      void enqueueAttempt.finally(() => {
        enqueueSettled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(
        enqueueSettled,
        false,
        "worker halt transaction이 열린 동안 enqueue admission은 commit되면 안 된다",
      );
      await haltSession.commitTransaction();
      enqueueOutcome = await enqueueAttempt;
    } finally {
      if (haltSession.inTransaction()) await haltSession.abortTransaction();
      await haltSession.endSession();
    }
    assert.equal(enqueueOutcome?.ok, false);
    assert.equal(enqueueOutcome?.error?.code, "LINE_HALTED");
    assert.equal(
      (
        await db.collection("credit_balances").findOne({
          characterId: String(ids.soldierCharacter),
        })
      )?.balance,
      balanceBeforeHaltedRequest,
    );
    assert.equal(
      await db.collection("credit_transactions").countDocuments({
        requestId: /repeat-halted/u,
      }),
      0,
    );
  },
);

test(
  "마감 뒤 재시작한 worker는 만료된 signal/reminder lease를 정리하고 공용 전환한다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const diversionAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1_000);
    const id = new ObjectId();
    await (await getDb()).collection("research_lab_jobs").insertOne({
      _id: id,
      requestId: "expired-reminder-diversion",
      recipeId: "ZULU_0040",
      kind: "REPEAT",
      status: "CLAIMABLE",
      destination: "CHARACTER",
      requesterUserId: String(ids.scientistUser),
      requesterDisplayName: "SCIENTIST",
      characterId: String(ids.scientistCharacter),
      characterCodename: "SCIENCE-TEST",
      output: {
        itemId: String(ids.output),
        slug: "broken-syllable",
        name: "깨진 음절",
        quantity: 1,
      },
      creditCost: 500,
      durationMs: 6 * 60 * 60 * 1_000,
      activeLineKey: "ZULU_0040",
      outstandingKey: `${String(ids.scientistCharacter)}:ZULU_0040`,
      queuedAt: now,
      claimDeadline: new Date(diversionAt.getTime() - 1),
      signalLeaseToken: "stale-signal",
      signalLeaseUntil: new Date(diversionAt.getTime() - 1_000),
      reminderLeaseToken: "stale-reminder",
      reminderLeaseUntil: new Date(diversionAt.getTime() - 1_000),
      leaseToken: "diversion-lease",
      leaseUntil: new Date(diversionAt.getTime() + 60_000),
      attempts: 1,
      pendingSignals: ["CHARACTER_CLAIMABLE"],
      createdAt: now,
      updatedAt: diversionAt,
      version: 2,
    });

    const result = await processClaimedResearchLabJob({
      id,
      leaseToken: "diversion-lease",
      now: diversionAt,
    });
    assert.equal(result?.transition, "CHARACTER_DIVERTED");
    assert.deepEqual(result?.job.pendingSignals, ["CHARACTER_DIVERTED"]);
    assert.equal(result?.job.signalLeaseToken, undefined);
    assert.equal(result?.job.reminderLeaseToken, undefined);
  },
);

test(
  "만료 signal worker가 side effect 직전 lease를 갱신하면 개인 claim과 원자적으로 fencing된다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const fenceAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1_000);
    const id = new ObjectId();
    await prepareCharacterInventoryItemLocks(
      String(ids.scientistCharacter),
      [String(ids.output)],
    );
    await (await getDb()).collection("research_lab_jobs").insertOne({
      _id: id,
      requestId: "signal-fencing-claim",
      recipeId: "INVERTED_SOCK",
      kind: "REPEAT",
      status: "CLAIMABLE",
      destination: "CHARACTER",
      requesterUserId: String(ids.scientistUser),
      requesterDisplayName: "SCIENTIST",
      characterId: String(ids.scientistCharacter),
      characterCodename: "SCIENCE-TEST",
      output: {
        itemId: String(ids.output),
        slug: "broken-syllable",
        name: "깨진 음절",
        quantity: 1,
      },
      creditCost: 500,
      durationMs: 6 * 60 * 60 * 1_000,
      activeLineKey: "INVERTED_SOCK",
      outstandingKey: `${String(ids.scientistCharacter)}:INVERTED_SOCK`,
      queuedAt: now,
      claimDeadline: new Date(fenceAt.getTime() + 60 * 60 * 1_000),
      signalLeaseToken: "signal-fence",
      signalLeaseUntil: new Date(fenceAt.getTime() - 1),
      attempts: 0,
      pendingSignals: ["CHARACTER_CLAIMABLE"],
      createdAt: now,
      updatedAt: fenceAt,
      version: 2,
    });

    assert.equal(
      await renewResearchLabSignalLease({
        id,
        signalLeaseToken: "signal-fence",
        expectedSignal: "CHARACTER_CLAIMABLE",
        now: fenceAt,
      }),
      true,
    );
    const blocked = await transaction((session) =>
      claimResearchLabCharacterOutput({
        id: String(id),
        requesterUserId: String(ids.scientistUser),
        characterId: String(ids.scientistCharacter),
        now: fenceAt,
        session,
      }),
    );
    assert.equal(blocked, null);
    assert.equal(
      await completeResearchLabSignal({
        id,
        signalLeaseToken: "signal-fence",
        expectedSignal: "CHARACTER_CLAIMABLE",
        now: fenceAt,
      }),
      true,
    );
    const claimed = await transaction((session) =>
      claimResearchLabCharacterOutput({
        id: String(id),
        requesterUserId: String(ids.scientistUser),
        characterId: String(ids.scientistCharacter),
        now: fenceAt,
        session,
      }),
    );
    assert.equal(claimed?.job.status, "COMPLETED");
  },
);

test(
  "수령 마감 뒤에는 기존 claimable signal lease를 side effect 직전에 갱신할 수 없다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const deadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1_000);
    const id = new ObjectId();
    await (await getDb()).collection("research_lab_jobs").insertOne({
      _id: id,
      requestId: "expired-claimable-signal-fence",
      recipeId: "ZULU_0028",
      kind: "REPEAT",
      status: "CLAIMABLE",
      destination: "CHARACTER",
      requesterUserId: String(ids.scientistUser),
      requesterDisplayName: "SCIENTIST",
      characterId: String(ids.scientistCharacter),
      characterCodename: "SCIENCE-TEST",
      output: {
        itemId: String(ids.output),
        slug: "broken-syllable",
        name: "깨진 음절",
        quantity: 1,
      },
      creditCost: 500,
      durationMs: 6 * 60 * 60 * 1_000,
      queuedAt: now,
      claimDeadline: deadline,
      signalLeaseToken: "expired-claimable-signal",
      signalLeaseUntil: new Date(deadline.getTime() + 60_000),
      attempts: 0,
      pendingSignals: ["CHARACTER_CLAIMABLE"],
      createdAt: now,
      updatedAt: deadline,
      version: 2,
    });

    assert.equal(
      await renewResearchLabSignalLease({
        id,
        signalLeaseToken: "expired-claimable-signal",
        expectedSignal: "CHARACTER_CLAIMABLE",
        now: new Date(deadline.getTime() + 1),
      }),
      false,
    );
  },
);
