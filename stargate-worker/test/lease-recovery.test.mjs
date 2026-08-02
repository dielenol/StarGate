import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduledJobLeaseLostError,
  SharedDbScheduledJobCoordinator,
} from "../dist/adapters/shared-db-job-coordinator.js";
import { WorkerLeaseSweeper } from "../dist/consumers/lease-sweeper.js";
import { ScheduledJobHandlerRegistry } from "../dist/jobs/handler-registry.js";

const context = {
  jobName: "stocks.tick",
  slotKey: "2099-01-01",
  requestedAt: new Date("2099-01-01T03:00:00.000Z"),
};

function claimedRun() {
  return {
    _id: "507f1f77bcf86cd799439011",
    jobName: context.jobName,
    slotKey: context.slotKey,
    status: "RUNNING",
    attempts: 1,
    availableAt: context.requestedAt,
    leaseToken: "current-token",
    leaseUntil: new Date(context.requestedAt.getTime() + 100),
    startedAt: context.requestedAt,
    updatedAt: context.requestedAt,
  };
}

test("장기 scheduled handler는 완료 전 lease를 갱신한다", async () => {
  let releaseHandler;
  const handlerGate = new Promise((resolve) => {
    releaseHandler = resolve;
  });
  let observeRenewal;
  const renewalObserved = new Promise((resolve) => {
    observeRenewal = resolve;
  });
  let completeCalls = 0;
  let failCalls = 0;
  const persistence = {
    async claim() {
      return claimedRun();
    },
    async renew(input) {
      assert.equal(input.leaseToken, "current-token");
      observeRenewal();
      return new Date(Date.now() + 100);
    },
    async complete() {
      completeCalls += 1;
      return true;
    },
    async fail() {
      failCalls += 1;
      return "FAILED";
    },
  };
  const handlers = new ScheduledJobHandlerRegistry([
    {
      jobName: context.jobName,
      async execute({ signal }) {
        assert.equal(signal.aborted, false);
        await handlerGate;
        return { mutated: true };
      },
    },
  ]);
  const coordinator = new SharedDbScheduledJobCoordinator(
    handlers,
    { leaseMs: 100, leaseRenewIntervalMs: 5 },
    persistence,
  );

  const execution = coordinator.executeOnce(context);
  await renewalObserved;
  releaseHandler();
  const result = await execution;

  assert.equal(result.outcome, "SUCCEEDED");
  assert.equal(completeCalls, 1);
  assert.equal(failCalls, 0);
});

test("lease 갱신에서 fencing token을 잃으면 handler를 중단하고 완료 처리하지 않는다", async () => {
  let completeCalls = 0;
  let failCalls = 0;
  const persistence = {
    async claim() {
      return claimedRun();
    },
    async renew() {
      return null;
    },
    async complete() {
      completeCalls += 1;
      return true;
    },
    async fail() {
      failCalls += 1;
      return null;
    },
  };
  const handlers = new ScheduledJobHandlerRegistry([
    {
      jobName: context.jobName,
      async execute({ signal }) {
        await new Promise((resolve) => {
          signal.addEventListener("abort", resolve, { once: true });
        });
        return { mutated: false };
      },
    },
  ]);
  const coordinator = new SharedDbScheduledJobCoordinator(
    handlers,
    { leaseMs: 100, leaseRenewIntervalMs: 5 },
    persistence,
  );

  await assert.rejects(
    coordinator.executeOnce(context),
    ScheduledJobLeaseLostError,
  );
  assert.equal(completeCalls, 0);
  assert.equal(failCalls, 1);
});

test("active lease sweeper는 scheduled/outbox 만료 건을 합산해 보고한다", async () => {
  const controller = new AbortController();
  const sweeper = new WorkerLeaseSweeper(async () => ({
    scheduledJobRunsDead: 2,
    integrationOutboxDead: 3,
  }));

  assert.deepEqual(
    await sweeper.tick({ signal: controller.signal }),
    { observedDue: 5, dead: 5 },
  );
});

test("재시도 claim lease는 원래 요청 시각이 아니라 현재 시각에서 시작한다", async () => {
  const retryAt = new Date("2099-01-02T00:00:00.000Z");
  let claimNow;
  let claimRequestedAt;
  let handlerRequestedAt;
  const persistence = {
    async claim(input) {
      claimNow = input.now;
      claimRequestedAt = input.requestedAt;
      return claimedRun();
    },
    async renew() {
      return new Date(retryAt.getTime() + 100);
    },
    async complete() {
      return true;
    },
    async fail() {
      return "FAILED";
    },
  };
  const handlers = new ScheduledJobHandlerRegistry([
    {
      jobName: context.jobName,
      async execute(handlerContext) {
        handlerRequestedAt = handlerContext.requestedAt;
        return { mutated: false };
      },
    },
  ]);
  const coordinator = new SharedDbScheduledJobCoordinator(
    handlers,
    {
      leaseMs: 100,
      leaseRenewIntervalMs: 5,
      now: () => retryAt,
    },
    persistence,
  );

  await coordinator.executeOnce(context);

  assert.equal(claimNow, retryAt);
  assert.equal(claimRequestedAt, context.requestedAt);
  assert.equal(handlerRequestedAt, context.requestedAt);
});
