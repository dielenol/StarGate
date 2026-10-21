import assert from "node:assert/strict";
import test from "node:test";

import { resolveTodayResyncKey } from "../../lib/calendar/today-resync.ts";

// CalendarClient 의 재동기화 effect 는 이 함수가 null 이 아닐 때만 router.refresh() 를 부르고,
// 돌려받은 키를 ref 에 남겨 다음 호출의 lastAttemptKey 로 넘긴다.

test("same day, or a device that runs behind the server, never resyncs", () => {
  assert.equal(resolveTodayResyncKey("2026-10-21", "2026-10-21", null), null);
  // 기기가 느리다 — 서버 날짜는 뒤로 가지 않으니 refresh 해도 바뀔 것이 없다.
  assert.equal(resolveTodayResyncKey("2026-10-20", "2026-10-21", null), null);
  // 연도 경계에서도 사전순 비교가 날짜순과 같다.
  assert.equal(resolveTodayResyncKey("2025-12-31", "2026-01-01", null), null);
});

test("a device date ahead of todayKey resyncs once per combination", () => {
  const first = resolveTodayResyncKey("2026-10-22", "2026-10-21", null);
  assert.equal(first, "2026-10-22|2026-10-21");
  // 같은 조합 — 기기 시계가 틀려 서버가 같은 todayKey 를 다시 내려준 경우 — 은 막힌다.
  assert.equal(resolveTodayResyncKey("2026-10-22", "2026-10-21", first), null);
  assert.equal(resolveTodayResyncKey("2026-12-31", "2026-12-30", null), "2026-12-31|2026-12-30");
  assert.equal(resolveTodayResyncKey("2027-01-01", "2026-12-31", null), "2027-01-01|2026-12-31");
});

test("a normal midnight rollover settles once the server returns the new day", () => {
  const attempt = resolveTodayResyncKey("2026-10-22", "2026-10-21", null);
  assert.equal(attempt, "2026-10-22|2026-10-21");
  // refresh 로 todayKey 가 기기 날짜를 따라잡으면 더 시도하지 않는다.
  assert.equal(resolveTodayResyncKey("2026-10-22", "2026-10-22", attempt), null);
});

test("a changed combination is allowed again", () => {
  const attempt = resolveTodayResyncKey("2026-10-22", "2026-10-21", null);
  // 기기 날짜가 하루 더 지나면 새 조합으로 다시 시도한다.
  assert.equal(
    resolveTodayResyncKey("2026-10-23", "2026-10-21", attempt),
    "2026-10-23|2026-10-21",
  );
  // 하루 앞선 기기에서 서버가 자정을 넘겨 todayKey 가 바뀌어도 새 조합으로 다시 시도한다.
  assert.equal(
    resolveTodayResyncKey("2026-10-23", "2026-10-22", "2026-10-23|2026-10-21"),
    "2026-10-23|2026-10-22",
  );
});

test("serverDayChanged attempts regardless of the device date and of an earlier record, and the key still records", () => {
  // 서버 자정 타이머가 숨김·오프라인으로 refresh 를 건너뛴 뒤의 복귀 — 기기가 느려 날짜가 같거나 뒤처져도 시도한다.
  assert.equal(
    resolveTodayResyncKey("2026-10-21", "2026-10-21", null, true),
    "2026-10-21|2026-10-21",
  );
  assert.equal(
    resolveTodayResyncKey("2026-10-20", "2026-10-21", null, true),
    "2026-10-20|2026-10-21",
  );
  // 기기가 빨라 서버 자정 전의 기기 자정에 같은 조합을 이미 썼어도 막히지 않는다.
  const stale = resolveTodayResyncKey("2026-10-22", "2026-10-21", null);
  assert.equal(
    resolveTodayResyncKey("2026-10-22", "2026-10-21", stale, true),
    "2026-10-22|2026-10-21",
  );
  // 돌려준 키를 기록하면 잇달아 오는 다음 이벤트(focus)의 기기 날짜 판정은 같은 조합으로 막힌다.
  const recorded = resolveTodayResyncKey("2026-10-22", "2026-10-21", null, true);
  assert.equal(resolveTodayResyncKey("2026-10-22", "2026-10-21", recorded), null);
  // 기본값(false)은 기존 판정 그대로.
  assert.equal(resolveTodayResyncKey("2026-10-21", "2026-10-21", null, false), null);
});
