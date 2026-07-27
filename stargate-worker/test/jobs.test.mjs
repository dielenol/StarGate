import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ScheduledJobDispatcher,
  UnknownScheduledJobError,
  buildScheduledJobSlotKey,
  parseScheduledJobName,
} from "../dist/jobs/dispatcher.js";

test("예약 작업 slot key는 KST 일자와 작업 이름으로 고정된다", () => {
  const requestedAt = new Date("2026-07-26T15:30:00.000Z");
  assert.equal(
    buildScheduledJobSlotKey("stocks.tick", requestedAt),
    "2026-07-27",
  );
});

test("알 수 없는 예약 작업은 dispatch 전에 거부한다", () => {
  assert.throws(
    () => parseScheduledJobName("stocks.run-now"),
    UnknownScheduledJobError,
  );
});

test("shadow dispatcher는 mutation 없이 명시적인 결과를 반환한다", async () => {
  const dispatcher = new ScheduledJobDispatcher("shadow");
  const result = await dispatcher.dispatch(
    "shop.refresh",
    new Date("2026-07-27T02:00:00.000Z"),
  );
  assert.equal(result.outcome, "SHADOW");
  assert.equal(result.summary.mutated, false);
});

test("Dokploy CLI 진입점은 네 작업을 shadow dispatch할 수 있다", () => {
  for (const jobName of [
    "shop.refresh",
    "stocks.tick",
    "credits.daily-allowance",
    "sessions.erp-reminders",
  ]) {
    const result = spawnSync(
      process.execPath,
      ["dist/cli/run-job.js", jobName],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, WORKER_MODE: "shadow" },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"outcome":"SHADOW"/);
  }
});

test("active CLI는 네 도메인 handler를 연결하고 Mongo 설정 없이는 실행하지 않는다", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/cli/run-job.js", "stocks.tick"],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, WORKER_MODE: "active", MONGODB_URI: "" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MONGODB_URI 환경변수가 필요합니다/);
  assert.doesNotMatch(result.stderr, /handler가 연결되지 않았습니다/);
});
