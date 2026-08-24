import assert from "node:assert/strict";
import test from "node:test";

import {
  REALTIME_RESOURCES,
  SCHEDULED_JOB_NAMES,
  expectedResearchDailyRankingSlot,
  isResearchDailyRankingCadenceOverdue,
  isRealtimeResource,
  isScheduledJobName,
} from "../dist/index.js";

test("실시간 resource 계약은 허용 목록만 통과시킨다", () => {
  assert.equal(isRealtimeResource("inventory"), true);
  assert.equal(isRealtimeResource("gallery"), true);
  assert.equal(isRealtimeResource("hall-of-fame"), true);
  assert.equal(isRealtimeResource("credit-balance"), false);
  assert.equal(new Set(REALTIME_RESOURCES).size, REALTIME_RESOURCES.length);
});

test("Dokploy 예약 작업 이름은 고정된 다섯 종류다", () => {
  assert.deepEqual(SCHEDULED_JOB_NAMES, [
    "shop.refresh",
    "stocks.tick",
    "credits.daily-allowance",
    "sessions.erp-reminders",
    "research.daily-ranking",
  ]);
  assert.equal(isScheduledJobName("stocks.tick"), true);
  assert.equal(isScheduledJobName("stocks.run-now"), false);
});

test("연구 일일 순위 예약 감시는 21:15 KST부터 당일 슬롯을 요구한다", () => {
  const beforeGrace = new Date("2026-08-24T12:14:59.000Z");
  const afterGrace = new Date("2026-08-24T12:15:00.000Z");

  assert.equal(expectedResearchDailyRankingSlot(beforeGrace), "2026-08-23");
  assert.equal(expectedResearchDailyRankingSlot(afterGrace), "2026-08-24");
  assert.equal(
    isResearchDailyRankingCadenceOverdue("2026-08-23", beforeGrace),
    false,
  );
  assert.equal(
    isResearchDailyRankingCadenceOverdue("2026-08-23", afterGrace),
    true,
  );
  assert.equal(
    isResearchDailyRankingCadenceOverdue("2026-08-24", afterGrace),
    false,
  );
  assert.equal(isResearchDailyRankingCadenceOverdue(undefined, afterGrace), true);
});
