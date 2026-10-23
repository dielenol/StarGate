import assert from "node:assert/strict";
import test from "node:test";
import { ERP_MAINTENANCE_WINDOW, getMaintenanceState, isErpPath, isErpApiPath, maintenanceRetryAfter } from "../schedule.ts";

const start = Date.parse("2026-10-25T20:00:00+09:00");
const end = Date.parse("2026-10-26T12:00:00+09:00");

test("확정된 KST 일정은 16시간이며 시작 포함·종료 제외로 자동 전환한다", () => {
  assert.equal(Date.parse(ERP_MAINTENANCE_WINDOW.startsAt), start);
  assert.equal(Date.parse(ERP_MAINTENANCE_WINDOW.endsAt), end);
  assert.equal(end - start, 16 * 60 * 60_000);
  for (const [time, phase] of [[start - 1, "scheduled"], [start, "active"], [end - 1, "active"], [end, "ended"]]) {
    assert.equal(getMaintenanceState({}, time).phase, phase);
  }
});

test("해제 스위치와 로컬 시험 일정은 기본 예약과 독립적이다", () => {
  assert.equal(getMaintenanceState({ ERP_MAINTENANCE_DISABLED: "1" }, start).phase, "off");
  const overridden = { ERP_MAINTENANCE_START_AT: "2026-10-23T00:00:00Z", ERP_MAINTENANCE_END_AT: "2026-10-23T00:01:00Z" };
  assert.equal(getMaintenanceState(overridden, Date.parse("2026-10-23T00:00:30Z")).phase, "active");
  assert.equal(getMaintenanceState(overridden, start).phase, "ended");
});

test("잘못된·부분·시간대 없는 예약은 무기한 차단을 만들지 않는다", () => {
  const validStart = ERP_MAINTENANCE_WINDOW.startsAt;
  for (const env of [
    { ERP_MAINTENANCE_START_AT: validStart },
    { ERP_MAINTENANCE_START_AT: "bad", ERP_MAINTENANCE_END_AT: "bad" },
    { ERP_MAINTENANCE_START_AT: "2026-10-25T20:00:00", ERP_MAINTENANCE_END_AT: "2026-10-26T12:00:00" },
    { ERP_MAINTENANCE_START_AT: validStart, ERP_MAINTENANCE_END_AT: validStart },
    { ERP_MAINTENANCE_START_AT: ERP_MAINTENANCE_WINDOW.endsAt, ERP_MAINTENANCE_END_AT: validStart },
  ]) {
    const state = getMaintenanceState(env, start);
    assert.equal(state.phase, "invalid");
    assert.equal(state.startsAt, null);
  }
});

test("ERP 루트·하위만 차단 대상으로 분류하고 공개·인증·cron을 보존한다", () => {
  for (const path of ["/erp", "/erp/", "/erp/characters/123"]) assert.equal(isErpPath(path), true);
  for (const path of ["/api/erp", "/api/erp/", "/api/erp/stocks/buy"]) assert.equal(isErpApiPath(path), true);
  for (const path of ["/", "/world", "/login", "/api/auth/session", "/api/maintenance", "/api/cron/test", "/erplease", "/api/erplease"]) {
    assert.equal(isErpPath(path) || isErpApiPath(path), false);
  }
});

test("Retry-After는 종료까지의 초를 올림하고 최소 1초다", () => {
  assert.equal(maintenanceRetryAfter(getMaintenanceState({}, start)), "57600");
  assert.equal(maintenanceRetryAfter(getMaintenanceState({}, end - 1)), "1");
});
