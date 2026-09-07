import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../schedule-stock-market-shutdown.ts");

function run(mode, args) {
  const temporary = mkdtempSync(join(tmpdir(), "stock-shutdown-cli-test-"));
  const hook = join(temporary, "mock.mjs");
  const mock = `
    let plan = process.env.SHUTDOWN_TEST_MODE === 'completed'
      ? { status: 'COMPLETED', executeAt: new Date('2026-09-07T09:00:00Z'), buysBlockedAt: new Date('2026-09-07T08:00:00Z') }
      : null;
    let scheduled = 0, applied = 0, priceChanges = 0;
    export function initServerless() {}
    export async function close() { console.log('TEST_TRACE:' + JSON.stringify({ scheduled, applied, priceChanges, status: plan?.status ?? null })); }
    export async function getStockPrices() { return ['TWS','STM','SSR','MSF','VFP','BPE','ART','GN3','SPZ'].map(ticker => ({ ticker, price: 100 })); }
    export async function getStockMarketShutdownPlan() { return plan; }
    export async function scheduleStockMarketShutdown(input) {
      scheduled++;
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
  writeFileSync(hook, `import { registerHooks } from 'node:module';\nconst url = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(mock)}`)};\nregisterHooks({ resolve(specifier, context, nextResolve) { return specifier === '@stargate/shared-db' ? { url, shortCircuit: true } : nextResolve(specifier, context); } });\n`);
  try {
    const result = spawnSync(process.execPath, ["--import", hook, "--experimental-strip-types", script, ...args], {
      encoding: "utf8", timeout: 15_000,
      env: { ...process.env, SHUTDOWN_TEST_MODE: mode, DB_NAME: "shutdown_cli_test", MONGODB_URI: "mongodb://127.0.0.1:1/never_connected" },
    });
    assert.equal(result.status, 0, result.stderr);
    const trace = result.stdout.split("\n").find(line => line.startsWith("TEST_TRACE:"));
    return JSON.parse(trace.slice("TEST_TRACE:".length));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

test("즉시 전환은 실제 미래 계획을 등록하고 도래 후 마지막 가격을 한 번 적용한다", () => {
  assert.deepEqual(run("new", ["--now", "--execute", "--yes", "--target-db", "shutdown_cli_test"]), {
    scheduled: 1, applied: 1, priceChanges: 1, status: "COMPLETED",
  });
});

test("완료된 즉시 전환을 다시 실행해도 가격을 재조정하지 않는다", () => {
  assert.deepEqual(run("completed", ["--now", "--execute", "--yes", "--target-db", "shutdown_cli_test"]), {
    scheduled: 1, applied: 1, priceChanges: 0, status: "COMPLETED",
  });
});

test("--now 미리보기는 계획이나 가격을 변경하지 않는다", () => {
  assert.deepEqual(run("new", ["--now", "--dry-run"]), {
    scheduled: 0, applied: 0, priceChanges: 0, status: null,
  });
});
