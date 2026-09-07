import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const state = globalThis.__stockAdminClosureTest = {
  shutdown: true, enabled: true, queued: 0, audit: 0, wire: 0, migration: 0,
};
const shared = "const state = globalThis.__stockAdminClosureTest;";
const mocks = {
  "next/server": `export const NextResponse = { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'Content-Type': 'application/json' } }) };`,
  "@/lib/auth/config": `export async function auth() { return { user: { id: 'gm', role: 'GM' } }; }`,
  "@/lib/auth/rbac": `export function requireRole() {}`,
  "@/lib/api/idempotency": `export const readIdempotencyKey = request => request.headers.get('Idempotency-Key');`,
  "@/lib/db/execute-economic-operation": `export class EconomicOperationConflictError extends Error {} export async function executeEconomicOperationResult(options) { return { ...await options.run({}), replayed: false }; }`,
  "@/lib/db/stocks": `${shared} export class StockMarketAutomationStoppedError extends Error {} export async function claimStockMarketMutationAllowed() { if (state.shutdown) throw new StockMarketAutomationStoppedError(); }`,
  "@/lib/db/stock-market": `${shared} export class StockMarketMigrationNotReadyError extends Error {} export async function claimStockMarketMigrationReady() { state.migration++; }`,
  "@/lib/outbox/integration": `${shared} export async function enqueueStockMarketRecoveryRequest() { state.queued++; } export async function enqueueGmAdminAudit() { state.audit++; }`,
  "@/lib/stocks/market": `${shared} export const isNovexV2Enabled = () => state.enabled;`,
  "@/lib/stocks/scheduled-tick": `${shared} export class ScheduledStockTickNotDueError extends Error {} export async function applyScheduledStockTick() { return { results: [], marketShutdown: state.shutdown, skipDiscord: state.shutdown }; }`,
  "@/lib/stocks/market-wire": `${shared} export async function notifyScheduledStockMarketWire() { state.wire++; }`,
  "@/lib/notifications/gm-admin-audit": `${shared} export async function scheduleGmAdminAudit() { state.audit++; }`,
  "@stargate/core/domain/mrbeast-soda-stock-impact": `export const isMrBeastSodaStockImpactTickEnabled = () => false;`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: pathToFileURL(resolve(root, `${specifier.slice(2)}.ts`)).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const recovery = await import("../recovery/route.ts");
const tick = await import("../tick/route.ts");
const request = body => new Request("http://localhost/api/admin/stocks", {
  method: "POST", headers: { "Idempotency-Key": "shutdown-route-test" }, body: JSON.stringify(body),
});

test("폐장 후 회차 복구는 outbox·감사 기록 전에 423으로 거부된다", async () => {
  const response = await recovery.POST(request({ slotKey: "2020-01-01 18:00" }));
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, "MARKET_SELL_ONLY");
  assert.equal(state.queued, 0);
  assert.equal(state.audit, 0);
  assert.equal(state.migration, 0);
});

test("폐장으로 중단한 legacy tick은 공시·감사 발송 없이 423을 반환한다", async () => {
  state.enabled = false;
  const response = await tick.POST(request({ force: true, operationId: "shutdown-tick" }));
  assert.equal(response.status, 423);
  assert.match((await response.json()).error, /가격은 영구 동결/);
  assert.equal(state.wire, 0);
  assert.equal(state.audit, 0);
});

test("종료 계획이 없는 시장의 기존 복구 요청은 유지된다", async () => {
  state.shutdown = false;
  state.enabled = true;
  const response = await recovery.POST(request({ slotKey: "2020-01-01 18:00" }));
  assert.equal((await response.json()).status, "QUEUED");
  assert.equal(state.queued, 1);
  assert.equal(state.audit, 1);
  assert.equal(state.migration, 1);
});
