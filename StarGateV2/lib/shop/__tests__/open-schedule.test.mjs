import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getNextScheduledShopOpening,
  getNextShopScheduleBoundary,
  hasShopForceCloseExpired,
  isShopOpen,
  resolveShopOpenState,
} from "../catalog.ts";

test("일요일도 06시부터 20시 전까지 영업한다", () => {
  assert.equal(isShopOpen(new Date("2026-08-01T20:59:59.999Z")), false);
  assert.equal(isShopOpen(new Date("2026-08-01T21:00:00.000Z")), true);
  assert.equal(isShopOpen(new Date("2026-08-02T00:04:00.000Z")), true);
  assert.equal(isShopOpen(new Date("2026-08-02T11:00:00.000Z")), false);
});

test("강제 종료는 같은 영업일 동안 유지된다", () => {
  const closedAt = new Date("2024-01-01T22:00:00.000Z"); // 화요일 07:00 KST
  const beforeNextOpening = new Date("2024-01-02T20:59:59.999Z");

  assert.equal(
    hasShopForceCloseExpired(closedAt, beforeNextOpening),
    false,
  );
});

test("강제 종료는 다음 정상 개점 시각에 만료된다", () => {
  const closedAt = new Date("2024-01-01T22:00:00.000Z"); // 화요일 07:00 KST
  const nextOpening = new Date("2024-01-02T21:00:00.000Z"); // 수요일 06:00 KST

  assert.equal(hasShopForceCloseExpired(closedAt, nextOpening), true);
});

test("개점 시각에 강제 종료하면 그 다음 정상 개점까지 유지된다", () => {
  const closedAtOpening = new Date("2023-12-31T21:00:00.000Z"); // 월요일 06:00 KST

  assert.equal(
    getNextScheduledShopOpening(closedAtOpening).toISOString(),
    "2024-01-01T21:00:00.000Z",
  );
});

test("토요일 강제 종료도 일요일 06시에 자동 운영으로 복귀한다", () => {
  const saturdayEvening = new Date("2024-01-06T10:00:00.000Z");

  assert.equal(
    getNextScheduledShopOpening(saturdayEvening).toISOString(),
    "2024-01-06T21:00:00.000Z",
  );
});

test("영업 중 다음 경계는 당일 20시 폐점이다", () => {
  const mondayNoon = new Date("2024-01-01T03:00:00.000Z");

  assert.equal(
    getNextShopScheduleBoundary(mondayNoon).toISOString(),
    "2024-01-01T11:00:00.000Z",
  );
});

test("일요일 영업 중 다음 경계는 당일 20시 폐점이다", () => {
  const sundayNoon = new Date("2024-01-07T03:00:00.000Z");

  assert.equal(
    getNextShopScheduleBoundary(sundayNoon).toISOString(),
    "2024-01-07T11:00:00.000Z",
  );
});

test("만료된 강제 종료는 자동 운영 상태로 해석된다", () => {
  const closedAt = new Date("2024-01-01T22:00:00.000Z");
  const nextOpening = new Date("2024-01-02T21:00:00.000Z");

  assert.deepEqual(
    resolveShopOpenState(nextOpening, {
      forceClosed: true,
      updatedAt: closedAt,
    }),
    {
      mode: "auto",
      scheduledOpen: true,
      forceOpen: false,
      forceClosed: false,
      isOpen: true,
    },
  );
});
