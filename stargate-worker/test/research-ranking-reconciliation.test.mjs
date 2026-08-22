import assert from "node:assert/strict";
import test from "node:test";

import { parseResearchRankingReconciliationArgs } from "../dist/cli/reconcile-research-ranking.js";
import {
  buildMongoTargetFingerprint,
  ResearchRankingReconciliationError,
  reconcileResearchRankingDeliveryUnknown,
} from "../dist/operations/research-ranking-reconciliation.js";

const ACTIVE_MESSAGE_ID = "123456789012345678";
const CANDIDATE_MESSAGE_ID = "223456789012345678";
const TARGET_FINGERPRINT = `mongo-target-v1:${"a".repeat(64)}`;
const OTHER_TARGET_FINGERPRINT = `mongo-target-v1:${"b".repeat(64)}`;
const OWNERSHIP_PROOF = `discord-webhook-message-v1:${"c".repeat(64)}`;

function targeted(input) {
  return { targetFingerprint: TARGET_FINGERPRINT, ...input };
}

function verifiedCandidate(messageId) {
  assert.equal(messageId, CANDIDATE_MESSAGE_ID);
  return Promise.resolve(OWNERSHIP_PROOF);
}

function isolatedState(overrides = {}) {
  return {
    _id: "team-research-all-time",
    requestedRevision: 4,
    syncedRevision: 2,
    messageIds: [ACTIVE_MESSAGE_ID],
    deliveryUnknownRevision: 3,
    deliveryUnknownAt: new Date("2026-08-22T12:00:00.000Z"),
    ...overrides,
  };
}

function makeDb(initialState, options = {}) {
  let state = structuredClone(initialState);
  const updates = [];
  return {
    get state() {
      return state;
    },
    updates,
    db: {
      collection() {
        return {
          async findOne() {
            return state ? structuredClone(state) : null;
          },
          async updateOne(filter, update) {
            updates.push({ filter, update });
            if (options.casFails) return { modifiedCount: 0 };
            for (const [key, value] of Object.entries(update.$set ?? {})) {
              state[key] = structuredClone(value);
            }
            for (const key of Object.keys(update.$unset ?? {})) {
              delete state[key];
            }
            return { modifiedCount: 1 };
          },
        };
      },
    },
  };
}

test("reconciliation은 기본 dry-run이며 격리 상태의 plan digest만 만든다", async () => {
  const fixture = makeDb(isolatedState());
  const result = await reconcileResearchRankingDeliveryUnknown(
    targeted({ action: "retry" }),
    { async getDbImpl() { return fixture.db; } },
  );

  assert.equal(result.status, "planned");
  assert.match(result.plan.planDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.plan.deliveryUnknownRevision, 3);
  assert.equal(result.plan.requestedRevision, 4);
  assert.deepEqual(result.plan.nextMessageIds, [ACTIVE_MESSAGE_ID]);
  assert.equal(fixture.updates.length, 0);
});

test("retry는 확인한 plan과 CAS가 같을 때만 격리를 해제하고 재조회한다", async () => {
  const fixture = makeDb(isolatedState());
  const dryRun = await reconcileResearchRankingDeliveryUnknown(
    targeted({ action: "retry" }),
    { async getDbImpl() { return fixture.db; } },
  );

  await assert.rejects(
    reconcileResearchRankingDeliveryUnknown(
      targeted({
        action: "retry",
        execute: true,
        expectedPlanDigest: "0".repeat(64),
      }),
      { async getDbImpl() { return fixture.db; } },
    ),
    ResearchRankingReconciliationError,
  );
  assert.equal(fixture.updates.length, 0);

  const applied = await reconcileResearchRankingDeliveryUnknown(
    targeted({
      action: "retry",
      execute: true,
      expectedPlanDigest: dryRun.plan.planDigest,
    }),
    {
      async getDbImpl() { return fixture.db; },
      now: () => new Date("2026-08-22T12:05:00.000Z"),
    },
  );

  assert.equal(applied.status, "applied");
  assert.equal(fixture.state.deliveryUnknownRevision, undefined);
  assert.equal(fixture.state.deliveryUnknownAt, undefined);
  assert.equal(fixture.state.lastError, undefined);
  assert.equal(fixture.state.syncedRevision, 2);
  assert.deepEqual(fixture.state.messageIds, [ACTIVE_MESSAGE_ID]);
  assert.equal(fixture.updates[0].filter.deliveryUnknownRevision, 3);
  assert.deepEqual(fixture.updates[0].filter.$and[0], {
    messageIds: [ACTIVE_MESSAGE_ID],
  });
});

test("adopt는 확인된 후보를 unknown revision의 active로 채택하고 이전 카드를 stale로 넘긴다", async () => {
  const fixture = makeDb(isolatedState());
  const input = {
    targetFingerprint: TARGET_FINGERPRINT,
    action: "adopt",
    candidateMessageId: CANDIDATE_MESSAGE_ID,
  };
  const dryRun = await reconcileResearchRankingDeliveryUnknown(input, {
    async getDbImpl() { return fixture.db; },
    verifyCandidateMessageOwnership: verifiedCandidate,
  });
  const applied = await reconcileResearchRankingDeliveryUnknown(
    {
      ...input,
      execute: true,
      expectedPlanDigest: dryRun.plan.planDigest,
    },
    {
      async getDbImpl() { return fixture.db; },
      verifyCandidateMessageOwnership: verifiedCandidate,
    },
  );

  assert.equal(applied.status, "applied");
  assert.equal(fixture.state.syncedRevision, 3);
  assert.deepEqual(fixture.state.messageIds, [CANDIDATE_MESSAGE_ID]);
  assert.deepEqual(fixture.state.staleMessageIds, [ACTIVE_MESSAGE_ID]);
  assert.equal(fixture.state.deliveryUnknownRevision, undefined);
});

test("cleanup 또는 lease가 남은 격리 상태와 CAS 변경은 fail closed 한다", async () => {
  for (const blockedState of [
    isolatedState({ leaseToken: "active-lease" }),
    isolatedState({ cleanupMessageIds: [CANDIDATE_MESSAGE_ID] }),
    isolatedState({ deliveryUnknownAt: undefined }),
  ]) {
    const fixture = makeDb(blockedState);
    await assert.rejects(
      reconcileResearchRankingDeliveryUnknown(
        targeted({ action: "retry" }),
        { async getDbImpl() { return fixture.db; } },
      ),
      ResearchRankingReconciliationError,
    );
  }

  const fixture = makeDb(isolatedState(), { casFails: true });
  const dryRun = await reconcileResearchRankingDeliveryUnknown(
    targeted({ action: "retry" }),
    { async getDbImpl() { return fixture.db; } },
  );
  await assert.rejects(
    reconcileResearchRankingDeliveryUnknown(
      targeted({
        action: "retry",
        execute: true,
        expectedPlanDigest: dryRun.plan.planDigest,
      }),
      { async getDbImpl() { return fixture.db; } },
    ),
    /CAS 조건이 변경/,
  );
});

test("adopt는 현재 active ID와 소유권 미확인 후보를 fail closed 한다", async () => {
  const fixture = makeDb(isolatedState());
  let verificationCalls = 0;
  await assert.rejects(
    reconcileResearchRankingDeliveryUnknown(
      targeted({
        action: "adopt",
        candidateMessageId: ACTIVE_MESSAGE_ID,
      }),
      {
        async getDbImpl() { return fixture.db; },
        async verifyCandidateMessageOwnership() {
          verificationCalls += 1;
          return OWNERSHIP_PROOF;
        },
      },
    ),
    /현재 활성 카드와 다른/,
  );
  assert.equal(verificationCalls, 0);

  await assert.rejects(
    reconcileResearchRankingDeliveryUnknown(
      targeted({
        action: "adopt",
        candidateMessageId: CANDIDATE_MESSAGE_ID,
      }),
      { async getDbImpl() { return fixture.db; } },
    ),
    /소유권 검증기/,
  );
  assert.equal(fixture.updates.length, 0);
});

test("plan digest는 자격증명 비노출 MongoDB 배포 대상 fingerprint에 묶인다", async () => {
  const first = buildMongoTargetFingerprint({
    uri: "mongodb://first:secret@mongo-b:27017,mongo-a:27017/stargate?replicaSet=rs0",
    dbName: "stargate",
  });
  const sameTarget = buildMongoTargetFingerprint({
    uri: "mongodb://second:different@mongo-a:27017,mongo-b:27017/other?retryWrites=true",
    dbName: "stargate",
  });
  const otherTarget = buildMongoTargetFingerprint({
    uri: "mongodb://second:different@mongo-c:27017/stargate",
    dbName: "stargate",
  });
  assert.equal(first, sameTarget);
  assert.notEqual(first, otherTarget);
  assert.doesNotMatch(first, /first|secret|mongo-a|stargate/);

  const fixture = makeDb(isolatedState());
  const plan = await reconcileResearchRankingDeliveryUnknown(
    targeted({ action: "retry" }),
    { async getDbImpl() { return fixture.db; } },
  );
  const otherPlan = await reconcileResearchRankingDeliveryUnknown(
    {
      targetFingerprint: OTHER_TARGET_FINGERPRINT,
      action: "retry",
    },
    { async getDbImpl() { return fixture.db; } },
  );
  assert.notEqual(plan.plan.planDigest, otherPlan.plan.planDigest);
});

test("CLI execute는 이중 확인, 대상 DB, dry-run digest를 모두 요구한다", () => {
  assert.deepEqual(parseResearchRankingReconciliationArgs([
    "--action",
    "retry",
  ]), {
    action: "retry",
    execute: false,
  });
  assert.throws(
    () => parseResearchRankingReconciliationArgs([
      "--action",
      "retry",
      "--execute",
    ]),
    /--execute --yes/,
  );
  assert.throws(
    () => parseResearchRankingReconciliationArgs([
      "--action",
      "retry",
      "--execute",
      "--yes",
    ]),
    /--target-db/,
  );
  assert.deepEqual(parseResearchRankingReconciliationArgs([
    "--action",
    "adopt",
    "--message-id",
    CANDIDATE_MESSAGE_ID,
    "--execute",
    "--yes",
    "--target-db",
    "stargate",
    "--target-id",
    TARGET_FINGERPRINT,
    "--expected-plan",
    "a".repeat(64),
  ]), {
    action: "adopt",
    candidateMessageId: CANDIDATE_MESSAGE_ID,
    execute: true,
    expectedPlanDigest: "a".repeat(64),
    targetDb: "stargate",
    targetId: TARGET_FINGERPRINT,
  });
});
