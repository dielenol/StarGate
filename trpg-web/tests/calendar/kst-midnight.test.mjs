import assert from "node:assert/strict";
import test from "node:test";

import {
  currentKstDateString,
  msUntilNextKstMidnight,
} from "../../lib/calendar/month.ts";

// CalendarClient 는 이 값으로 todayKey 재동기화 자정 타이머를 건다. KST 자정은 15:00 UTC 다.

const DAY_MS = 24 * 60 * 60 * 1000;

test("msUntilNextKstMidnight counts down to 15:00 UTC", () => {
  assert.equal(msUntilNextKstMidnight(new Date("2026-10-20T14:59:59.000Z")), 1000);
  assert.equal(msUntilNextKstMidnight(new Date("2026-10-20T14:59:59.999Z")), 1);
  assert.equal(
    msUntilNextKstMidnight(new Date("2026-10-20T00:00:00.000Z")),
    15 * 60 * 60 * 1000,
  );
});

test("msUntilNextKstMidnight returns a whole day at KST midnight and counts from there", () => {
  assert.equal(msUntilNextKstMidnight(new Date("2026-10-20T15:00:00.000Z")), DAY_MS);
  assert.equal(msUntilNextKstMidnight(new Date("2026-10-20T15:00:00.001Z")), DAY_MS - 1);
  assert.equal(msUntilNextKstMidnight(new Date("2026-10-20T15:00:05.000Z")), DAY_MS - 5000);
});

test("now + msUntilNextKstMidnight lands exactly on the next KST date rollover", () => {
  const samples = [
    "2026-10-20T03:17:45.123Z",
    "2026-12-31T14:59:59.000Z", // 연말 경계
    "2028-02-28T20:00:00.000Z", // 윤년 2/29 로 넘어가는 밤
    "2026-03-08T09:30:00.000Z", // 미국 DST 시작일
    "2026-03-29T00:59:59.000Z", // 유럽 DST 시작일
    "2026-11-01T06:00:00.000Z", // 미국 DST 종료일
  ];

  for (const iso of samples) {
    const now = new Date(iso);
    const ms = msUntilNextKstMidnight(now);
    assert.ok(ms > 0 && ms <= DAY_MS, `${iso}: ${ms}`);

    const midnight = new Date(now.getTime() + ms);
    assert.equal(midnight.toISOString().slice(11), "15:00:00.000Z", iso);
    // 자정 1ms 전은 아직 같은 날, 자정은 다음 날.
    assert.equal(
      currentKstDateString(new Date(midnight.getTime() - 1)),
      currentKstDateString(now),
      iso,
    );
    assert.notEqual(currentKstDateString(midnight), currentKstDateString(now), iso);
  }
});

test("KST has no DST: consecutive midnights stay exactly 24h apart through a whole year", () => {
  // 다른 시간대의 DST 전환일(3/8·3/29·10/25·11/1)을 모두 지나도록 1년을 하루씩 걷는다.
  let now = new Date("2026-01-01T00:00:00.000Z");
  for (let day = 0; day < 366; day += 1) {
    const midnight = new Date(now.getTime() + msUntilNextKstMidnight(now));
    assert.equal(msUntilNextKstMidnight(midnight), DAY_MS, midnight.toISOString());
    now = new Date(midnight.getTime() + 1);
    assert.equal(msUntilNextKstMidnight(now), DAY_MS - 1, now.toISOString());
  }
  assert.equal(currentKstDateString(now), "2027-01-02");
});
