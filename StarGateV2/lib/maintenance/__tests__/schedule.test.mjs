import assert from "node:assert/strict";
import test from "node:test";
import { ERP_MAINTENANCE_WINDOW, getMaintenanceState, isMaintenanceResource, maintenanceRetryAfter } from "../schedule.ts";

const start = Date.parse(ERP_MAINTENANCE_WINDOW.startsAt);
const end = Date.parse(ERP_MAINTENANCE_WINDOW.endsAt);

test("다음 안내 시각·1개월·2개월 후에도 수동 해제 전까지 봉쇄를 유지한다", () => {
  for (const [time, phase] of [[start - 1, "scheduled"], [start, "active"], [end - 1, "active"], [end, "active"], [end + 1, "active"], [end + 31 * 86_400_000, "active"], [end + 62 * 86_400_000, "active"]]) {
    const state = getMaintenanceState({}, time);
    assert.equal(state.phase, phase);
    assert.equal(state.resumePolicy, "manual");
    assert.equal(state.scope, "site");
  }
});

test("명시적 해제만 off이며 로컬 시험 종료 시각도 해제를 일으키지 않는다", () => {
  assert.equal(getMaintenanceState({ ERP_MAINTENANCE_DISABLED: "1" }, end).phase, "off");
  assert.equal(getMaintenanceState({ ERP_MAINTENANCE_DISABLED: "0" }, end).phase, "active");
  const override = { NODE_ENV: "test", ERP_MAINTENANCE_START_AT: "2026-10-23T00:00:00Z", ERP_MAINTENANCE_END_AT: "2026-10-23T00:01:00Z" };
  assert.equal(getMaintenanceState(override, start).phase, "active");
  assert.equal(getMaintenanceState(override, start).endsAt, override.ERP_MAINTENANCE_END_AT);
});

test("잘못된·부분·시간대 없는 설정이 기본 봉쇄를 해제하지 않는다", () => {
  const validStart = ERP_MAINTENANCE_WINDOW.startsAt;
  for (const env of [
    { ERP_MAINTENANCE_START_AT: validStart },
    { ERP_MAINTENANCE_START_AT: "bad", ERP_MAINTENANCE_END_AT: "bad" },
    { ERP_MAINTENANCE_START_AT: "2026-10-25T20:00:00", ERP_MAINTENANCE_END_AT: "2026-10-26T12:00:00" },
    { ERP_MAINTENANCE_START_AT: validStart, ERP_MAINTENANCE_END_AT: validStart },
    { ERP_MAINTENANCE_START_AT: ERP_MAINTENANCE_WINDOW.endsAt, ERP_MAINTENANCE_END_AT: validStart },
  ]) {
    assert.equal(getMaintenanceState({ ...env, NODE_ENV: "test" }, end).phase, "active");
    assert.equal(getMaintenanceState({ ...env, NODE_ENV: "test" }, end).startsAt, validStart);
  }
});

test("운영 예외는 공지·상태·화면 표시 자산뿐이다", () => {
  for (const path of ["/maintenance", "/api/maintenance", "/_next/static/chunks/app.js", "/assets/StarGate_logo_watermark.webp", "/assets/favicon.ico"]) assert.equal(isMaintenanceResource(path, "production"), true, path);
  for (const path of ["/", "/world", "/login", "/api/auth/session", "/api/cron/test", "/api/erp", "/maintenance/preview", "/api/maintenance/write", "/download.json", "/_next/data/id/index.json", "/_next/image", "/assets/probe.html"]) assert.equal(isMaintenanceResource(path, "production"), false, path);
  assert.equal(isMaintenanceResource("/maintenance/preview", "development"), true);
});

test("재확인 간격은 자동 재개 시각을 뜻하지 않는다", () => {
  assert.equal(maintenanceRetryAfter(), "3600");
});


test("운영의 미래·과거 시험 환경변수가 봉쇄나 안내 시각을 변경하지 않는다", () => {
  for (const NODE_ENV of ["production", undefined]) {
    const state = getMaintenanceState({ NODE_ENV, ERP_MAINTENANCE_START_AT: "2027-01-01T00:00:00Z", ERP_MAINTENANCE_END_AT: "2027-01-02T00:00:00Z" }, start + 60_000);
    assert.equal(state.phase, "active");
    assert.equal(state.startsAt, ERP_MAINTENANCE_WINDOW.startsAt);
    assert.equal(state.endsAt, ERP_MAINTENANCE_WINDOW.endsAt);
  }
});

test("시험 환경도 존재하지 않는 날짜를 기본 일정으로 되돌린다", () => {
  const state = getMaintenanceState({ NODE_ENV: "test", ERP_MAINTENANCE_START_AT: "2027-02-30T20:00:00+09:00", ERP_MAINTENANCE_END_AT: "2027-03-04T12:00:00+09:00" }, end);
  assert.equal(state.phase, "active");
  assert.equal(state.startsAt, ERP_MAINTENANCE_WINDOW.startsAt);
});
