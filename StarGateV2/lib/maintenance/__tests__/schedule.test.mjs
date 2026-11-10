import assert from "node:assert/strict";
import test from "node:test";
import { ERP_MAINTENANCE_WINDOW, LAST_MAINTENANCE_WINDOW, getMaintenanceState, isMaintenanceResource, maintenanceRetryAfter } from "../schedule.ts";

const start = Date.parse(LAST_MAINTENANCE_WINDOW.startsAt);
const end = Date.parse(LAST_MAINTENANCE_WINDOW.endsAt);

test("다음 안내 시각·1개월·2개월 후에도 수동 해제 전까지 봉쇄를 유지한다", () => {
  for (const [time, phase] of [[start - 1, "scheduled"], [start, "active"], [end - 1, "active"], [end, "active"], [end + 1, "active"], [end + 31 * 86_400_000, "active"], [end + 62 * 86_400_000, "active"]]) {
    const state = getMaintenanceState({}, time, LAST_MAINTENANCE_WINDOW);
    assert.equal(state.phase, phase);
    assert.equal(state.resumePolicy, "manual");
    assert.equal(state.scope, "site");
  }
});

test("명시적 해제만 off이며 로컬 시험 종료 시각도 해제를 일으키지 않는다", () => {
  assert.equal(getMaintenanceState({ ERP_MAINTENANCE_DISABLED: "1" }, end, LAST_MAINTENANCE_WINDOW).phase, "off");
  assert.equal(getMaintenanceState({ ERP_MAINTENANCE_DISABLED: "0" }, end, LAST_MAINTENANCE_WINDOW).phase, "active");
  const override = { NODE_ENV: "test", ERP_MAINTENANCE_START_AT: "2026-10-23T00:00:00Z", ERP_MAINTENANCE_END_AT: "2026-10-23T00:01:00Z" };
  assert.equal(getMaintenanceState(override, start, LAST_MAINTENANCE_WINDOW).phase, "active");
  assert.equal(getMaintenanceState(override, start, LAST_MAINTENANCE_WINDOW).endsAt, override.ERP_MAINTENANCE_END_AT);
});

test("잘못된·부분·시간대 없는 설정이 코드에 넣은 봉쇄 일정을 해제하지 않는다", () => {
  const validStart = LAST_MAINTENANCE_WINDOW.startsAt;
  for (const env of [
    { ERP_MAINTENANCE_START_AT: validStart },
    { ERP_MAINTENANCE_START_AT: "bad", ERP_MAINTENANCE_END_AT: "bad" },
    { ERP_MAINTENANCE_START_AT: "2026-10-25T20:00:00", ERP_MAINTENANCE_END_AT: "2026-10-26T12:00:00" },
    { ERP_MAINTENANCE_START_AT: validStart, ERP_MAINTENANCE_END_AT: validStart },
    { ERP_MAINTENANCE_START_AT: LAST_MAINTENANCE_WINDOW.endsAt, ERP_MAINTENANCE_END_AT: validStart },
  ]) {
    assert.equal(getMaintenanceState({ ...env, NODE_ENV: "test" }, end, LAST_MAINTENANCE_WINDOW).phase, "active");
    assert.equal(getMaintenanceState({ ...env, NODE_ENV: "test" }, end, LAST_MAINTENANCE_WINDOW).startsAt, validStart);
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
    const state = getMaintenanceState({ NODE_ENV, ERP_MAINTENANCE_START_AT: "2027-01-01T00:00:00Z", ERP_MAINTENANCE_END_AT: "2027-01-02T00:00:00Z" }, start + 60_000, LAST_MAINTENANCE_WINDOW);
    assert.equal(state.phase, "active");
    assert.equal(state.startsAt, LAST_MAINTENANCE_WINDOW.startsAt);
    assert.equal(state.endsAt, LAST_MAINTENANCE_WINDOW.endsAt);
  }
});

test("시험 환경도 존재하지 않는 날짜를 코드에 넣은 일정으로 되돌린다", () => {
  const state = getMaintenanceState({ NODE_ENV: "test", ERP_MAINTENANCE_START_AT: "2027-02-30T20:00:00+09:00", ERP_MAINTENANCE_END_AT: "2027-03-04T12:00:00+09:00" }, end, LAST_MAINTENANCE_WINDOW);
  assert.equal(state.phase, "active");
  assert.equal(state.startsAt, LAST_MAINTENANCE_WINDOW.startsAt);
});


// 아래는 세 번째 인자를 생략해 코드에 배포된 기본 일정(ERP_MAINTENANCE_WINDOW)을 그대로 검증한다.
// 봉쇄를 다시 켜려고 일정을 넣으면 이 묶음이 실패하므로 함께 갱신한다.
const afterLastStart = start + 60_000;
const defaultTimes = [afterLastStart, start + 31 * 86_400_000, Date.parse("2027-06-01T00:00:00+09:00")];

function assertOff(state, label) {
  assert.equal(state.phase, "off", label);
  assert.equal(state.startsAt, null, label);
  assert.equal(state.endsAt, null, label);
  assert.equal(state.scope, "site", label);
  assert.equal(state.resumePolicy, "manual", label);
}

test("기본 일정은 null이며 운영에서는 마지막 봉쇄 시각 직후·한 달 뒤·2027년에도 off이다", () => {
  assert.equal(ERP_MAINTENANCE_WINDOW, null);
  for (const NODE_ENV of ["production", undefined]) {
    for (const time of defaultTimes) {
      const state = getMaintenanceState({ NODE_ENV }, time);
      assertOff(state, `${NODE_ENV} ${time}`);
      assert.equal(state.serverNow, time);
    }
  }
});

test("기본 일정에서는 운영의 START/END 환경변수로 봉쇄를 켤 수 없다", () => {
  const override = { ERP_MAINTENANCE_START_AT: LAST_MAINTENANCE_WINDOW.startsAt, ERP_MAINTENANCE_END_AT: LAST_MAINTENANCE_WINDOW.endsAt };
  for (const NODE_ENV of ["production", undefined]) {
    for (const time of [start - 1, ...defaultTimes]) assertOff(getMaintenanceState({ ...override, NODE_ENV }, time), `${NODE_ENV} ${time}`);
  }
});

test("기본 일정에서는 ERP_MAINTENANCE_DISABLED 값과 무관하게 off이다", () => {
  for (const ERP_MAINTENANCE_DISABLED of ["0", "1", "", undefined]) {
    for (const time of defaultTimes) assertOff(getMaintenanceState({ NODE_ENV: "production", ERP_MAINTENANCE_DISABLED }, time), `${ERP_MAINTENANCE_DISABLED} ${time}`);
  }
});

test("기본 일정에서도 개발·시험 환경은 유효한 override로 예약·봉쇄를 시험할 수 있다", () => {
  const override = { ERP_MAINTENANCE_START_AT: "2027-01-01T00:00:00+09:00", ERP_MAINTENANCE_END_AT: "2027-01-01T12:00:00+09:00" };
  const overrideStart = Date.parse(override.ERP_MAINTENANCE_START_AT);
  const overrideEnd = Date.parse(override.ERP_MAINTENANCE_END_AT);
  for (const NODE_ENV of ["test", "development"]) {
    for (const [time, phase] of [[overrideStart - 1, "scheduled"], [overrideStart, "active"], [overrideEnd, "active"], [overrideEnd + 62 * 86_400_000, "active"]]) {
      const state = getMaintenanceState({ ...override, NODE_ENV }, time);
      assert.equal(state.phase, phase, `${NODE_ENV} ${time}`);
      assert.equal(state.startsAt, override.ERP_MAINTENANCE_START_AT);
      assert.equal(state.endsAt, override.ERP_MAINTENANCE_END_AT);
    }
    assertOff(getMaintenanceState({ ...override, NODE_ENV, ERP_MAINTENANCE_DISABLED: "1" }, overrideStart), `${NODE_ENV} disabled`);
  }
});

test("기본 일정에서 잘못된·부분·시간대 없는 override는 봉쇄를 켜지 않는다", () => {
  const validStart = LAST_MAINTENANCE_WINDOW.startsAt;
  for (const env of [
    {},
    { ERP_MAINTENANCE_START_AT: validStart },
    { ERP_MAINTENANCE_END_AT: LAST_MAINTENANCE_WINDOW.endsAt },
    { ERP_MAINTENANCE_START_AT: "bad", ERP_MAINTENANCE_END_AT: "bad" },
    { ERP_MAINTENANCE_START_AT: "2026-10-25T20:00:00", ERP_MAINTENANCE_END_AT: "2026-10-26T12:00:00" },
    { ERP_MAINTENANCE_START_AT: validStart, ERP_MAINTENANCE_END_AT: validStart },
    { ERP_MAINTENANCE_START_AT: LAST_MAINTENANCE_WINDOW.endsAt, ERP_MAINTENANCE_END_AT: validStart },
    { ERP_MAINTENANCE_START_AT: "2027-02-30T20:00:00+09:00", ERP_MAINTENANCE_END_AT: "2027-03-04T12:00:00+09:00" },
  ]) {
    for (const NODE_ENV of ["test", "development"]) assertOff(getMaintenanceState({ ...env, NODE_ENV }, end), JSON.stringify(env));
  }
});
