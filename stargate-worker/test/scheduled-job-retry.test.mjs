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

test("현재 KST 주식 slot 재시도는 실제 재시도 시각과 원본 slot fence를 유지한다", async () => {
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
        if (input.jobNames.includes("stocks.tick")) {
          assert.equal(input.currentSlotKey, "2099-01-02 09:00");
          return 0;
        }
        assert.equal(input.currentSlotKey, "2099-01-02");
        return 2;
      },
      async findDue(input) {
        assert.equal(input.maxAttempts, undefined);
        assert.equal(input.limit, 4);
        assert.equal(input.slotKey, undefined);
        assert.deepEqual(input.jobNames, [
          "shop.refresh",
          "stocks.tick",
          "credits.daily-allowance",
          "sessions.erp-reminders",
        ]);
        return [dueRun("stocks.tick", "2099-01-02 09:00", startedAt)];
      },
    },
  );

  const result = await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });

  assert.deepEqual(receivedContext, {
    jobName: "stocks.tick",
    slotKey: "2099-01-02 09:00",
    requestedAt: now,
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
      async expireStale(input) {
        return input.jobNames.includes("stocks.tick") ? 0 : 1;
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

test("NOVEX handler는 retry context의 실제 now와 명시 slotKey를 tick에 전달한다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  process.env.NOVEX_V2_MODE = "enabled";
  let options;
  try {
    const handlers = createDefaultScheduledJobHandlers({
      async applyNovexTick(input) {
        options = input;
        return {
          date: "2099-01-02",
          slot: input.slotKey,
          results: [],
          skipDiscord: true,
        };
      },
      async processDividendPayouts() {
        return { paid: 0, totalAmount: 0, drained: true };
      },
    });
    const now = new Date("2099-01-02T05:00:00.000Z");
    await handlers.require("stocks.tick").execute({
      jobName: "stocks.tick",
      slotKey: "2099-01-02 13:00",
      requestedAt: now,
      mode: "active",
      signal: new AbortController().signal,
    });
    assert.deepEqual(options, { now, slotKey: "2099-01-02 13:00" });
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
});

test("NOVEX shadow는 신규 산식을 읽기 전용 계산하면서 legacy 시세를 계속 확정한다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  process.env.NOVEX_V2_MODE = "shadow";
  const calls = [];
  try {
    const handlers = createDefaultScheduledJobHandlers({
      async previewNovexTick(input) {
        calls.push(`preview:${input.slotKey}`);
        return {
          date: "2099-01-02",
          slot: input.slotKey,
          results: [{ ticker: "NVS", status: "updated" }],
          skipDiscord: true,
          shadowState: {
            version: 1,
            lastCompletedSlotKey: input.slotKey,
            completedAt: "2099-01-02T04:00:00.000Z",
            prices: [],
            rejectedDividendActionIds: [],
            pendingFlows: [],
            seenFlowOperationKeys: [],
          },
        };
      },
      async applyLegacyStockTick() {
        calls.push("legacy");
        return {
          date: "2099-01-02",
          slot: "2099-01-02 12:00",
          results: [{ ticker: "NVS", status: "updated" }],
          skipDiscord: true,
        };
      },
      async hasActiveRightsOffering() {
        return false;
      },
      async rebuildStockTickSummary() {
        return null;
      },
    });
    const summary = await handlers.require("stocks.tick").execute({
      jobName: "stocks.tick",
      slotKey: "2099-01-02 13:00",
      requestedAt: new Date("2099-01-02T04:00:00Z"),
      mode: "active",
      signal: new AbortController().signal,
    });
    assert.deepEqual(calls, ["preview:2099-01-02 13:00", "legacy"]);
    assert.equal(summary.novexMode, "shadow");
    assert.equal(summary.shadowUpdated, 1);
    assert.equal(JSON.parse(summary.shadowStateJson).lastCompletedSlotKey, "2099-01-02 13:00");
    assert.equal(JSON.parse(summary.shadowComparisonJson)[0].ticker, "NVS");
    assert.equal(summary.mutated, true);
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
});

test("NOVEX shadow의 09·18·23시는 legacy 가격을 재실행하지 않는다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  process.env.NOVEX_V2_MODE = "shadow";
  let legacyCalls = 0;
  try {
    const handlers = createDefaultScheduledJobHandlers({
      async previewNovexTick(input) {
        return {
          date: input.slotKey.slice(0, 10),
          slot: input.slotKey,
          results: [],
          skipDiscord: true,
          shadowState: {
            version: 1,
            lastCompletedSlotKey: input.slotKey,
            completedAt: "2099-01-02T00:00:00.000Z",
            prices: [],
            rejectedDividendActionIds: [],
            pendingFlows: [],
            seenFlowOperationKeys: [],
          },
        };
      },
      async applyLegacyStockTick() {
        legacyCalls += 1;
        throw new Error("legacy should not run");
      },
    });
    for (const slotKey of ["2099-01-02 09:00", "2099-01-02 18:00", "2099-01-02 23:00"]) {
      const summary = await handlers.require("stocks.tick").execute({
        jobName: "stocks.tick",
        slotKey,
        requestedAt: new Date("2099-01-02T14:00:00Z"),
        mode: "active",
        signal: new AbortController().signal,
      });
      assert.equal(summary.mutated, false);
      assert.equal(summary.shadowSlot, slotKey);
    }
    assert.equal(legacyCalls, 0);
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
});

test("legacy disabled 모드는 종전 12시 결과로 Discord 장부를 갱신한다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  process.env.NOVEX_V2_MODE = "disabled";
  let wireCalls = 0;
  try {
    const handlers = createDefaultScheduledJobHandlers({
      async applyLegacyStockTick() {
        return {
          date: "2099-01-02",
          slot: "2099-01-02 12:00",
          results: [{ ticker: "NVS", status: "updated", price: 10 }],
        };
      },
      async hasActiveRightsOffering() {
        return false;
      },
      async rebuildStockTickSummary() {
        return null;
      },
      async requestStockWire() {
        wireCalls += 1;
        return true;
      },
    });
    const summary = await handlers.require("stocks.tick").execute({
      jobName: "stocks.tick",
      slotKey: "2099-01-02 12:00",
      requestedAt: new Date("2099-01-02T03:00:00Z"),
      mode: "active",
      signal: new AbortController().signal,
    });
    assert.equal(summary.announcement, true);
    assert.equal(wireCalls, 1);
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
});

test("active 유상증자 중 disabled/shadow legacy tick은 fail closed 한다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  let legacyCalls = 0;
  try {
    for (const mode of ["disabled", "shadow"]) {
      process.env.NOVEX_V2_MODE = mode;
      const handlers = createDefaultScheduledJobHandlers({
        async previewNovexTick(input) {
          return {
            date: input.slotKey.slice(0, 10),
            slot: input.slotKey,
            results: [],
            skipDiscord: true,
          };
        },
        async hasActiveRightsOffering() {
          return true;
        },
        async applyLegacyStockTick() {
          legacyCalls += 1;
          throw new Error("legacy should not run");
        },
      });
      await assert.rejects(
        handlers.require("stocks.tick").execute({
          jobName: "stocks.tick",
          slotKey: "2099-01-02 13:00",
          requestedAt: new Date("2099-01-02T04:00:00Z"),
          mode: "active",
          signal: new AbortController().signal,
        }),
        new RegExp(`ACTIVE_RIGHTS_OFFERING_REQUIRES_NOVEX_ENABLED:${mode}`),
      );
    }
    assert.equal(legacyCalls, 0);
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
});

test("정규 일요일 일정 누락·중복 warning은 scheduled job summary에 보존된다", async () => {
  const previousMode = process.env.NOVEX_V2_MODE;
  process.env.NOVEX_V2_MODE = "enabled";
  try {
    for (const warning of ["REGULAR_SESSION_MISSING", "REGULAR_SESSION_AMBIGUOUS"]) {
      const handlers = createDefaultScheduledJobHandlers({
        async applyNovexTick(input) {
          return { date: "2099-01-04", slot: input.slotKey, results: [], skipDiscord: true, warning };
        },
        async processDividendPayouts() {
          return { paid: 0, totalAmount: 0, drained: true };
        },
      });
      const summary = await handlers.require("stocks.tick").execute({
        jobName: "stocks.tick",
        slotKey: "2099-01-04 18:00",
        requestedAt: new Date("2099-01-04T09:01:00Z"),
        mode: "active",
        signal: new AbortController().signal,
      });
      assert.equal(summary.warning, warning);
    }
  } finally {
    if (previousMode === undefined) delete process.env.NOVEX_V2_MODE;
    else process.env.NOVEX_V2_MODE = previousMode;
  }
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
          dueRun("stocks.tick", "2099-01-02 09:00", now),
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
