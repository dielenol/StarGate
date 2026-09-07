import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../schedule-stock-market-shutdown.ts");

function run(mode, args, expectedStatus = 0) {
  const temporary = mkdtempSync(join(tmpdir(), "stock-shutdown-cli-test-"));
  const hook = join(temporary, "mock.mjs");
  const mock = `
    let plan = process.env.SHUTDOWN_TEST_MODE.startsWith('completed')
      ? { status: 'COMPLETED', executeAt: new Date('2026-09-07T09:00:00Z'), buysBlockedAt: new Date('2026-09-07T08:00:00Z'), ...(process.env.SHUTDOWN_TEST_MODE === 'completed-null' ? { announcementImageUrl: null } : {}) }
      : null;
    let scheduled = 0, applied = 0, priceChanges = 0;
    export function initServerless() {}
    export async function close() {
      console.log('TEST_TRACE:' + JSON.stringify({ scheduled, applied, priceChanges, status: plan?.status ?? null }));
      console.log('TEST_PLAN:' + JSON.stringify(plan));
    }
    export async function getStockPrices() { return ['TWS','STM','SSR','MSF','VFP','BPE','ART','GN3','SPZ'].map(ticker => ({ ticker, price: 100 })); }
    export async function getStockMarketShutdownPlan() { return plan; }
    export async function scheduleStockMarketShutdown(input) {
      scheduled++;
      if (input.announcementImageUrl === null) throw new Error('Unnormalized null input');
      if (!plan) {
        if (input.executeAt <= new Date()) throw new Error('Past schedule');
        plan = { ...input, status: 'SCHEDULED', buysBlockedAt: new Date() };
      }
    }
    export async function applyDueStockMarketShutdown() {
      applied++;
      if (plan.status === 'COMPLETED') return { status: 'ALREADY_COMPLETED', plan };
      if (plan.executeAt > new Date()) return { status: 'NOT_DUE', plan };
      priceChanges++;
      plan.status = 'COMPLETED';
      return { status: 'APPLIED', plan };
    }
  `;
  writeFileSync(hook, `import { registerHooks } from 'node:module';
    const RealDate = Date;
    const startMs = RealDate.now();
    const fixedMs = RealDate.parse('2026-09-07T18:30:00+09:00');
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixedMs + RealDate.now() - startMs])); }
      static now() { return fixedMs + RealDate.now() - startMs; }
    };
    const url = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(mock)}`)};
    registerHooks({ resolve(specifier, context, nextResolve) { return specifier === '@stargate/shared-db' ? { url, shortCircuit: true } : nextResolve(specifier, context); } });
  `);
  try {
    const result = spawnSync(process.execPath, ["--import", hook, "--experimental-strip-types", script, ...args], {
      encoding: "utf8", timeout: 15_000,
      env: { ...process.env, SHUTDOWN_TEST_MODE: mode, DB_NAME: "shutdown_cli_test", MONGODB_URI: "mongodb://127.0.0.1:1/never_connected" },
    });
    assert.equal(result.status, expectedStatus, result.stderr);
    const trace = result.stdout.split("\n").find(line => line.startsWith("TEST_TRACE:"));
    const plan = result.stdout.split("\n").find(line => line.startsWith("TEST_PLAN:"));
    return {
      trace: trace ? JSON.parse(trace.slice("TEST_TRACE:".length)) : null,
      plan: plan ? JSON.parse(plan.slice("TEST_PLAN:".length)) : null,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

test("즉시 전환은 실제 미래 계획을 등록하고 도래 후 마지막 가격을 한 번 적용한다", () => {
  assert.deepEqual(run("new", ["--now", "--execute", "--yes", "--target-db", "shutdown_cli_test"]).trace, {
    scheduled: 1, applied: 1, priceChanges: 1, status: "COMPLETED",
  });
});

test("완료된 즉시 전환을 다시 실행해도 가격을 재조정하지 않는다", () => {
  assert.deepEqual(run("completed", ["--now", "--execute", "--yes", "--target-db", "shutdown_cli_test"]).trace, {
    scheduled: 1, applied: 1, priceChanges: 0, status: "COMPLETED",
  });
});

test("--now 미리보기는 계획이나 가격을 변경하지 않는다", () => {
  assert.deepEqual(run("new", ["--now", "--dry-run"]).trace, {
    scheduled: 0, applied: 0, priceChanges: 0, status: null,
  });
});

test("장마감 예약은 23시와 뉴스 이미지를 저장하고 즉시 폭락·공시를 실행하지 않는다", () => {
  const result = run("new", ["--execute", "--yes", "--target-db", "shutdown_cli_test"]);
  assert.deepEqual(result.trace, { scheduled: 1, applied: 0, priceChanges: 0, status: "SCHEDULED" });
  assert.equal(result.plan.executeAt, "2026-09-07T14:00:00.000Z");
  assert.equal(result.plan.reason, "파리 사태로 인한 쇼크");
  assert.match(result.plan.announcementImageUrl, /^https:\/\/www\.ordonet\.co\.kr\/assets\/world-view\/.+\.webp$/);
  assert.equal(result.plan.declines.length, 9);
});

test("장마감 기본 미리보기는 예약이나 가격을 변경하지 않는다", () => {
  const result = run("new", []);
  assert.deepEqual(result.trace, { scheduled: 0, applied: 0, priceChanges: 0, status: null });
  assert.equal(result.plan, null);
});

test("장마감 실제 예약은 대상 DB 확인이 없으면 연결 전에 거부한다", () => {
  assert.deepEqual(run("new", ["--execute", "--yes"], 1), { trace: null, plan: null });
});

test("이미지 null로 저장된 완료 계획 재시도는 첨부나 가격을 바꾸지 않는다", () => {
  assert.deepEqual(run("completed-null", ["--now", "--execute", "--yes", "--target-db", "shutdown_cli_test"]).trace, {
    scheduled: 1, applied: 1, priceChanges: 0, status: "COMPLETED",
  });
});
