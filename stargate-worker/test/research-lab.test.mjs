import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ObjectId } from "mongodb";

import {
  ResearchLabConsumer,
  researchLabPartitionOrderAt,
} from "../dist/consumers/research-lab.js";

function job(overrides = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(),
    requestId: "request-1",
    recipeId: "ZULU_0028",
    kind: "REPEAT",
    status: "RUNNING",
    destination: "SHARED",
    requesterUserId: "user-1",
    requesterDisplayName: "user",
    characterId: "character-1",
    characterCodename: "SCIENTIST",
    output: { itemId: "item-1", slug: "sample", name: "샘플", quantity: 1 },
    creditCost: 500,
    durationMs: 6 * 60 * 60 * 1_000,
    queuedAt: now,
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    version: 2,
    ...overrides,
  };
}

function port(overrides = {}) {
  return {
    async assertReady() {},
    async haltExhausted() { return 0; },
    async countHalted() { return 0; },
    async startIdle() { return []; },
    async claimProduction() { return null; },
    async processProduction() { return null; },
    async releaseProduction() { return "RETRY"; },
    async claimSignal() { return null; },
    async deliverSignal() {},
    async completeSignal() { return true; },
    async releaseSignal() { return true; },
    async claimReminder() { return null; },
    async deliverReminder() {},
    async completeReminder() { return true; },
    async releaseReminder() { return true; },
    ...overrides,
  };
}

test("claimable ERP side effect는 lease 갱신 fencing 성공 뒤에만 실행한다", async () => {
  const source = await readFile(
    new URL("../src/consumers/research-lab.ts", import.meta.url),
    "utf8",
  );
  const signalStart = source.indexOf("async function deliverResearchLabSignal");
  const reminderStart = source.indexOf("async function deliverResearchLabReminder");
  const signalBody = source.slice(signalStart, reminderStart);
  const reminderBody = source.slice(reminderStart, source.indexOf("export function createSharedDbResearchLabPort"));
  assert.ok(
    signalBody.indexOf("renewResearchLabSignalLease") <
      signalBody.indexOf("notifyRequester"),
  );
  assert.ok(
    reminderBody.indexOf("renewResearchLabReminderLease") <
      reminderBody.indexOf("notifyRequester"),
  );
});

test("개인 수령 알림의 partition 순서는 수령 가능, 1시간 전, 공용 전환 순이다", () => {
  const claimableAt = new Date("2026-08-10T00:00:00.000Z");
  const reminderAt = new Date("2026-08-10T05:00:00.000Z");
  const deadline = new Date("2026-08-10T06:00:00.000Z");
  const divertedAt = new Date("2026-08-10T06:00:01.000Z");
  const claimable = job({
    status: "CLAIMABLE",
    destination: "CHARACTER",
    updatedAt: new Date("2026-08-10T05:30:00.000Z"),
    claimReminderAt: reminderAt,
    claimDeadline: deadline,
  });
  const diverted = job({
    status: "DIVERTED_SHARED",
    destination: "CHARACTER",
    completedAt: divertedAt,
    updatedAt: divertedAt,
  });

  assert.equal(
    researchLabPartitionOrderAt(claimable, "CHARACTER_CLAIMABLE").getTime(),
    claimableAt.getTime(),
  );
  assert.equal(
    researchLabPartitionOrderAt(
      claimable,
      "CHARACTER_CLAIM_REMINDER",
    ).getTime(),
    reminderAt.getTime(),
  );
  assert.equal(
    researchLabPartitionOrderAt(diverted, "CHARACTER_DIVERTED").getTime(),
    divertedAt.getTime(),
  );
});

test("index·catalog preflight 실패 시 research worker는 어떤 mutation도 시작하지 않는다", async () => {
  let claimed = false;
  const consumer = new ResearchLabConsumer(port({
    async assertReady() { throw new Error("storage not ready"); },
    async claimProduction() { claimed = true; return null; },
  }));

  await assert.rejects(consumer.tick(), /storage not ready/);
  assert.equal(claimed, false);
});

test("생산 처리 8회 실패 안전정지는 CRITICAL incident 결과로 노출된다", async () => {
  const claimed = job({ leaseToken: "lease", attempts: 8 });
  const consumer = new ResearchLabConsumer(port({
    async countHalted() { return 1; },
    async claimProduction() { return claimed; },
    async processProduction() { throw new Error("inventory unavailable"); },
    async releaseProduction() { return "HALTED"; },
  }));

  const result = await consumer.tick();
  assert.equal(result.failed, 1);
  assert.equal(result.dead, 1);
  assert.equal(result.operationalAlert?.severity, "CRITICAL");
  assert.equal(result.operationalAlert?.fingerprint, "research-lab-worker-halted");
});

test("생산 완료 뒤 signal 전달 실패는 생산 결과를 throw하지 않고 lease만 재개방한다", async () => {
  let released = false;
  const signal = job({
    status: "COMPLETED",
    pendingSignals: ["SHARED_COMPLETED"],
    signalLeaseToken: "signal-lease",
  });
  const consumer = new ResearchLabConsumer(port({
    async claimSignal() { return signal; },
    async deliverSignal() { throw new Error("discord unavailable"); },
    async releaseSignal() { released = true; return true; },
  }));

  const result = await consumer.tick();
  assert.equal(result.failed, 1);
  assert.equal(result.dead, 0);
  assert.equal(released, true);
});

test("여러 전이 signal은 큐의 첫 이벤트만 lease 완료 대상으로 전달한다", async () => {
  let completedSignal = null;
  const signal = job({
    status: "DIVERTED_SHARED",
    pendingSignals: ["CHARACTER_CLAIMABLE", "CHARACTER_DIVERTED"],
    signalLeaseToken: "signal-lease",
  });
  const consumer = new ResearchLabConsumer(port({
    async claimSignal() { return signal; },
    async completeSignal(input) {
      completedSignal = input.expectedSignal;
      return true;
    },
  }));

  const result = await consumer.tick();
  assert.equal(result.delivered, 1);
  assert.equal(completedSignal, "CHARACTER_CLAIMABLE");
});

test("CLAIMABLE 1h reminder는 멱등 전달 뒤 reminder lease를 완료한다", async () => {
  let delivered = 0;
  let completed = 0;
  const reminder = job({
    status: "CLAIMABLE",
    reminderLeaseToken: "reminder-lease",
    claimDeadline: new Date(Date.now() + 60 * 60 * 1_000),
  });
  const consumer = new ResearchLabConsumer(port({
    async claimReminder() { return reminder; },
    async deliverReminder() { delivered += 1; },
    async completeReminder() { completed += 1; return true; },
  }));

  const result = await consumer.tick();
  assert.equal(result.delivered, 1);
  assert.equal(delivered, 1);
  assert.equal(completed, 1);
});
