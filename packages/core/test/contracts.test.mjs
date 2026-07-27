import assert from "node:assert/strict";
import test from "node:test";

import {
  REALTIME_RESOURCES,
  SCHEDULED_JOB_NAMES,
  isRealtimeResource,
  isScheduledJobName,
} from "../dist/index.js";

test("실시간 resource 계약은 허용 목록만 통과시킨다", () => {
  assert.equal(isRealtimeResource("inventory"), true);
  assert.equal(isRealtimeResource("credit-balance"), false);
  assert.equal(new Set(REALTIME_RESOURCES).size, REALTIME_RESOURCES.length);
});

test("Dokploy 예약 작업 이름은 고정된 네 종류다", () => {
  assert.deepEqual(SCHEDULED_JOB_NAMES, [
    "shop.refresh",
    "stocks.tick",
    "credits.daily-allowance",
    "sessions.erp-reminders",
  ]);
  assert.equal(isScheduledJobName("stocks.tick"), true);
  assert.equal(isScheduledJobName("stocks.run-now"), false);
});
