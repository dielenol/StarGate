import test from "node:test";
import assert from "node:assert/strict";

import {
  formatKstMonthDayWeekday,
  kstDateKey,
  kstDateTimeToUnix,
  nowKstYmd,
} from "../dist/utils/kst.js";

test("KST 날짜·시각을 UTC epoch 초로 바꾼다 (자정·월말 경계 포함)", () => {
  assert.equal(kstDateTimeToUnix("2026-11-08", "20:00"), Date.UTC(2026, 10, 8, 11) / 1000);
  // KST 00:30 은 전날 UTC 15:30
  assert.equal(kstDateTimeToUnix("2026-11-01", "00:30"), Date.UTC(2026, 9, 31, 15, 30) / 1000);
  assert.equal(kstDateTimeToUnix("2026-12-31", "23:59"), Date.UTC(2026, 11, 31, 14, 59) / 1000);
  assert.equal(kstDateTimeToUnix("2026/11/08", "20:00"), null);
  assert.equal(kstDateTimeToUnix("2026-11-08", "8:00"), null);
});

test("UTC 시각을 KST 날짜로 환산한다", () => {
  // UTC 2026-10-31 15:30 = KST 2026-11-01 00:30
  assert.deepEqual(nowKstYmd(new Date(Date.UTC(2026, 9, 31, 15, 30))), {
    year: 2026,
    month: 11,
    day: 1,
  });
  assert.equal(kstDateKey({ year: 2026, month: 1, day: 5 }), "2026-01-05");
});

test("월/일(요일) 표기는 날짜만으로 요일을 정한다", () => {
  assert.equal(formatKstMonthDayWeekday("2026-10-22"), "10/22(목)");
  assert.equal(formatKstMonthDayWeekday("2026-11-08"), "11/08(일)");
  assert.equal(formatKstMonthDayWeekday("잘못된 값"), "잘못된 값");
});
