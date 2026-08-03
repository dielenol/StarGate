import assert from "node:assert/strict";
import test from "node:test";

import { ScheduledJobRetryConsumer } from "../dist/consumers/scheduled-job-retry.js";
import {
  ScheduledJobPartialFailureError,
  createDefaultScheduledJobHandlers,
} from "../dist/jobs/default-handlers.js";

function dueRun(jobName, slotKey, startedAt) {
  return {
    _id: "507f1f77bcf86cd799439011",
    jobName,
    slotKey,
    status: "FAILED",
    attempts: 1,
    availableAt: new Date("2099-01-02T00:00:00.000Z"),
    startedAt,
    updatedAt: startedAt,
  };
}

test("현재 KST slot의 due 작업만 원래 요청 시각으로 다시 실행한다", async () => {
  const now = new Date("2099-01-02T03:30:00.000Z");
  const startedAt = new Date("2099-01-02T03:00:00.000Z");
  let receivedContext;
  const consumer = new ScheduledJobRetryConsumer(
    {
      async executeOnce(context) {
        receivedContext = context;
        return {
          jobName: context.jobName,
          slotKey: context.slotKey,
          outcome: "SUCCEEDED",
          summary: { mutated: true },
        };
      },
    },
    {
      now: () => now,
      async expireStale(input) {
        assert.equal(input.currentSlotKey, "2099-01-02");
        return 2;
      },
      async findDue(input) {
        assert.equal(input.maxAttempts, undefined);
        assert.equal(input.limit, 4);
        assert.equal(input.slotKey, "2099-01-02");
        assert.deepEqual(input.jobNames, [
          "shop.refresh",
          "stocks.tick",
          "credits.daily-allowance",
          "sessions.erp-reminders",
        ]);
        return [dueRun("stocks.tick", "2099-01-02", startedAt)];
      },
    },
  );

  const result = await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });

  assert.deepEqual(receivedContext, {
    jobName: "stocks.tick",
    slotKey: "2099-01-02",
    requestedAt: startedAt,
    mode: "active",
  });
  assert.deepEqual(result, {
    observedDue: 1,
    claimed: 1,
    succeeded: 1,
    failed: 0,
    dead: 2,
  });
});

test("이전 KST slot이 조회 경쟁으로 섞여도 경제 handler를 실행하지 않는다", async () => {
  const executed = [];
  const now = new Date("2099-01-02T03:30:00.000Z");
  const consumer = new ScheduledJobRetryConsumer(
    {
      async executeOnce(context) {
        executed.push(context.jobName);
        return {
          jobName: context.jobName,
          slotKey: context.slotKey,
          outcome: "SUCCEEDED",
          summary: { mutated: true },
        };
      },
    },
    {
      now: () => now,
      async expireStale() {
        return 1;
      },
      async findDue() {
        return [
          dueRun(
            "shop.refresh",
            "2099-01-01",
            new Date("2099-01-01T02:00:00.000Z"),
          ),
        ];
      },
    },
  );

  const result = await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });

  assert.deepEqual(executed, []);
  assert.equal(result.dead, 1);
  assert.equal(result.claimed, 0);
});

test("세션 알림 재시도는 지난 창 대신 실제 재시도 시각을 사용한다", async () => {
  const now = new Date("2099-01-02T12:10:00.000Z");
  let requestedAt;
  const consumer = new ScheduledJobRetryConsumer(
    {
      async executeOnce(context) {
        requestedAt = context.requestedAt;
        return {
          jobName: context.jobName,
          slotKey: context.slotKey,
          outcome: "SUCCEEDED",
          summary: { mutated: false },
        };
      },
    },
    {
      now: () => now,
      async expireStale() {
        return 0;
      },
      async findDue() {
        return [
          dueRun(
            "sessions.erp-reminders",
            "2099-01-02",
            new Date("2099-01-02T12:00:00.000Z"),
          ),
        ];
      },
    },
  );

  await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });

  assert.equal(requestedAt, now);
});

test("한 예약 작업 재시도가 실패해도 같은 batch를 마친 뒤 health 오류를 낸다", async () => {
  const now = new Date("2099-01-02T03:30:00.000Z");
  const executed = [];
  const consumer = new ScheduledJobRetryConsumer(
    {
      async executeOnce(context) {
        executed.push(context.jobName);
        if (context.jobName === "shop.refresh") {
          throw new Error("temporary");
        }
        return {
          jobName: context.jobName,
          slotKey: context.slotKey,
          outcome: "SUCCEEDED",
          summary: { mutated: false },
        };
      },
    },
    {
      now: () => now,
      async expireStale() {
        return 0;
      },
      async findDue() {
        return [
          dueRun("shop.refresh", "2099-01-02", now),
          dueRun("stocks.tick", "2099-01-02", now),
        ];
      },
    },
  );

  await assert.rejects(
    consumer.tick({
      mode: "active",
      signal: new AbortController().signal,
    }),
    AggregateError,
  );
  assert.deepEqual(executed, ["shop.refresh", "stocks.tick"]);
});

test("수당·세션 알림의 부분 실패는 handler 성공으로 확정하지 않는다", async () => {
  const handlers = createDefaultScheduledJobHandlers({
    async grantAllowances() {
      return {
        date: "2099-01-01",
        totalCandidates: 2,
        granted: 1,
        skipped: 0,
        failed: 1,
        notificationsSent: 0,
        notificationsFailed: 1,
        totalAmount: 10,
        results: [],
        policyVersion: "test",
      };
    },
    async sendSessionReminders() {
      return {
        now: "2099-01-01T12:00:00.000Z",
        windowEnd: "2099-01-02T12:00:00.000Z",
        registra: {
          candidates: 1,
          sent: 0,
          skipped: 0,
          failed: 1,
          recipients: 1,
          notifications: 0,
          items: [],
        },
        trpg: {
          candidates: 0,
          sent: 0,
          skipped: 0,
          failed: 0,
          recipients: 0,
          notifications: 0,
          items: [],
        },
      };
    },
  });
  const context = {
    jobName: "credits.daily-allowance",
    slotKey: "2099-01-01",
    requestedAt: new Date("2099-01-01T03:00:00.000Z"),
    mode: "active",
    signal: new AbortController().signal,
  };

  await assert.rejects(
    handlers.require("credits.daily-allowance").execute(context),
    (error) => {
      assert.ok(error instanceof ScheduledJobPartialFailureError);
      assert.match(error.message, /failed=1/);
      assert.match(error.message, /notificationsFailed=1/);
      return true;
    },
  );
  await assert.rejects(
    handlers.require("sessions.erp-reminders").execute({
      ...context,
      jobName: "sessions.erp-reminders",
    }),
    ScheduledJobPartialFailureError,
  );
});
