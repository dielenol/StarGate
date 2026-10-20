import assert from "node:assert/strict";
import test from "node:test";

import { formatKoreanDate, WEEKDAY_LABELS } from "../../lib/calendar/format.ts";

// 날짜 패널 제목과 세션 상세 모달의 "날짜" 가 같은 함수를 쓴다 — 형식이 바뀌면 두 곳이 함께 바뀐다.

test("formatKoreanDate renders YYYY년 MM월 DD일 with the weekday label", () => {
  assert.equal(formatKoreanDate("2026-10-19"), "2026년 10월 19일 (월)");
  assert.equal(formatKoreanDate("2026-10-24"), "2026년 10월 24일 (토)");
  assert.equal(formatKoreanDate("2026-12-25"), "2026년 12월 25일 (금)");
});

test("formatKoreanDate walks every weekday label across one week", () => {
  // 2026-10-18 은 일요일.
  const week = Array.from({ length: 7 }, (_, offset) => `2026-10-${18 + offset}`);
  const labels = week.map((dateKey) => formatKoreanDate(dateKey).slice(-2, -1));
  assert.deepEqual(labels, [...WEEKDAY_LABELS]);
});

test("formatKoreanDate keeps month and day zero-padded", () => {
  assert.equal(formatKoreanDate("2026-01-05"), "2026년 01월 05일 (월)");
  assert.equal(formatKoreanDate("2027-02-01"), "2027년 02월 01일 (월)");
  assert.equal(formatKoreanDate("2026-11-09"), "2026년 11월 09일 (월)");
});

test("formatKoreanDate handles leap days and year boundaries", () => {
  assert.equal(formatKoreanDate("2028-02-29"), "2028년 02월 29일 (화)");
  assert.equal(formatKoreanDate("2026-12-31"), "2026년 12월 31일 (목)");
  assert.equal(formatKoreanDate("2027-01-01"), "2027년 01월 01일 (금)");
});

test("formatKoreanDate returns a malformed key unchanged", () => {
  assert.equal(formatKoreanDate("2027-02-29"), "2027-02-29");
  assert.equal(formatKoreanDate("2026-1-5"), "2026-1-5");
  assert.equal(formatKoreanDate("2026-02-30"), "2026-02-30");
  assert.equal(formatKoreanDate(""), "");
});
