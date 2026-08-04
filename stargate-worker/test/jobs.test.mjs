import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ScheduledJobDispatcher,
  UnknownScheduledJobError,
  buildScheduledJobSlotKey,
  parseScheduledJobName,
} from "../dist/jobs/dispatcher.js";
import { buildStockMarketWireDesiredPayloads } from "../dist/jobs/desired-state.js";

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

test("정기 주식 공시는 시장감시실 4개 장부 메시지로 구성한다", () => {
  const payloads = buildStockMarketWireDesiredPayloads(
    {
      date: "2026-07-20",
      slot: "2026-07-20 12:00",
      results: [
        {
          ticker: "TWS",
          previousPrice: 6.17,
          price: 6.65,
          changePercent: 7.78,
          eventText: "정기 변동 +7.78%",
          eventTier: "routine",
          status: "updated",
        },
        {
          ticker: "VFP",
          previousPrice: 105.81,
          price: 95.96,
          changePercent: -9.31,
          eventText: "의료기기 승인 지연 @everyone -9.31%",
          eventTier: "scenario",
          status: "updated",
        },
      ],
    },
    new Date("2026-07-20T03:13:00.000Z"),
  );

  assert.equal(payloads.length, 4);
  assert.deepEqual(
    payloads.map((payload) => payload.embeds[0].title),
    [
      "재무기구 정기 시세 공시 · 2026-07-20",
      "상승 마감 장부",
      "하락 마감 장부",
      "보합 및 감시실 특이사항",
    ],
  );
  assert.deepEqual(
    payloads.slice(1).map((payload) => payload.embeds[0].color),
    [0x2fbf71, 0xd95f5f, 0xc5a059],
  );
  assert.match(payloads[0].content, /ORDO-NET 주식 거래소 바로가기/);
  assert.equal(payloads[1].content, undefined);
  assert.equal(payloads[0].username, "재무기구 시장감시실");
  assert.deepEqual(
    payloads[0].embeds[0].fields.map((field) => field.name),
    ["공시 개요", "시장 방향", "NOVEX 종합지수"],
  );
  assert.match(payloads[1].embeds[0].fields[0].value, /토와스키 \(TWS\)/);
  assert.match(payloads[2].embeds[0].fields[0].value, /VF제약 \(VFP\)/);
  assert.match(
    payloads[3].embeds[0].fields.at(-1).value,
    /특이 · 하락 · \*\*VF제약 \(VFP\)\*\*/,
  );
  assert.match(payloads[3].embeds[0].fields.at(-1).value, /@​everyone/);
});

test("이미 처리된 주식 tick은 빈 Discord 장부로 교체하지 않는다", () => {
  const payloads = buildStockMarketWireDesiredPayloads(
    {
      date: "2026-07-20",
      slot: "2026-07-20 12:00",
      results: [
        {
          ticker: "TWS",
          previousPrice: 6.65,
          price: 6.65,
          changePercent: 0,
          eventText: "오늘 정기 변동 처리됨",
          eventTier: "routine",
          status: "skipped",
        },
      ],
    },
    new Date("2026-07-20T03:13:00.000Z"),
  );

  assert.deepEqual(payloads, []);
});
