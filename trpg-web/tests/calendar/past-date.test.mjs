import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarGrid,
  currentKstDateString,
} from "../../lib/calendar/month.ts";

// CalendarClient 는 `cell.dateKey < todayKey` 문자열 비교로 지난 날짜를 판정한다.
// 그 비교가 날짜 순서와 같으려면 그리드 키와 오늘 키가 모두 0 패딩된 YYYY-MM-DD 여야 한다.

test("buildCalendarGrid keys sort lexicographically in chronological order across a year boundary", () => {
  const keys = [...buildCalendarGrid(2026, 12), ...buildCalendarGrid(2027, 1)]
    .map((cell) => cell.dateKey);
  const unique = [...new Set(keys)];

  for (const key of unique) assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  const byString = [...unique].sort();
  const byTime = [...unique].sort((a, b) => Date.parse(a) - Date.parse(b));
  assert.deepEqual(byString, byTime);
});

test("currentKstDateString rolls over at KST midnight (15:00 UTC)", () => {
  assert.equal(currentKstDateString(new Date("2026-10-18T14:59:59.999Z")), "2026-10-18");
  assert.equal(currentKstDateString(new Date("2026-10-18T15:00:00.000Z")), "2026-10-19");
  assert.equal(currentKstDateString(new Date("2026-12-31T15:00:00.000Z")), "2027-01-01");
});

test("string comparison marks exactly the cells before today as past", () => {
  const todayKey = currentKstDateString(new Date("2026-10-19T03:00:00.000Z"));
  const grid = buildCalendarGrid(2026, 10);

  const past = grid.filter((cell) => cell.dateKey < todayKey).map((cell) => cell.dateKey);

  // 2026-10 그리드는 9/27(일)부터 시작한다 — 9/27~9/30 4칸 + 10/1~10/18 18칸.
  assert.equal(past.length, 22);
  assert.equal(past[0], "2026-09-27");
  assert.equal(past.at(-1), "2026-10-18");
  assert.equal(grid.some((cell) => cell.dateKey === todayKey && cell.dateKey < todayKey), false);
});
