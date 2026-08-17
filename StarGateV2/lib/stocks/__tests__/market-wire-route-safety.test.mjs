import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TICK_ROUTE = new URL(
  "../../../app/api/cron/stocks/tick/route.ts",
  import.meta.url,
);
const ADMIN_PRICE_ROUTE = new URL(
  "../../../app/api/erp/admin/stocks/prices/route.ts",
  import.meta.url,
);
const STOCK_MUTATION_HOOK = new URL(
  "../../../hooks/mutations/useStocksMutation.ts",
  import.meta.url,
);
const STOCK_ADMIN_CLIENT = new URL(
  "../../../app/(erp)/erp/admin/stocks/StockAdminClient.tsx",
  import.meta.url,
);
const STATE_DB = new URL("../../db/stock-market-wire.ts", import.meta.url);
const WORKER_DESIRED_STATE = new URL(
  "../../../../stargate-worker/src/consumers/discord-desired-state.ts",
  import.meta.url,
);
const WORKER_JOBS = new URL(
  "../../../../stargate-worker/src/jobs/default-handlers.ts",
  import.meta.url,
);
const RECOVERY_ROUTE = new URL(
  "../../../app/api/erp/admin/stocks/recovery/route.ts",
  import.meta.url,
);
const STOCK_PREFERENCES_ROUTE = new URL(
  "../../../app/api/erp/stocks/preferences/route.ts",
  import.meta.url,
);
const STOCK_PREFERENCES_MUTATION = new URL(
  "../../../hooks/mutations/useStockMarketPreferencesMutation.ts",
  import.meta.url,
);
const STOCK_TRADE_CLIENT = new URL(
  "../../../app/(erp)/erp/stock/[ticker]/StockTradeClient.tsx",
  import.meta.url,
);
const STOCK_DATA_BUILDERS = new URL(
  "../../../app/(erp)/erp/stock/_data.ts",
  import.meta.url,
);
const STOCK_QUERY_HOOKS = new URL(
  "../../../hooks/queries/useStocksQuery.ts",
  import.meta.url,
);
const SHARED_STOCK_MARKET = new URL(
  "../../../../packages/shared-db/src/crud/stock-market.ts",
  import.meta.url,
);
const STOCK_MARKET_INDEX = new URL("../market-index.ts", import.meta.url);
const STOCK_INFO = new URL(
  "../../../app/(erp)/erp/stock/_stockInfo.ts",
  import.meta.url,
);
const NOVEX_ADMIN_MUTATION_ROUTES = [
  "../../../app/api/erp/admin/stocks/disclosures/route.ts",
  "../../../app/api/erp/admin/stocks/disclosures/[disclosureId]/route.ts",
  "../../../app/api/erp/admin/stocks/calendar/route.ts",
  "../../../app/api/erp/admin/stocks/corporate-actions/route.ts",
].map((path) => new URL(path, import.meta.url));
const CORPORATE_ACTION_CANCEL_ROUTE = new URL(
  "../../../app/api/erp/admin/stocks/corporate-actions/[actionId]/route.ts",
  import.meta.url,
);

test("the worker scheduled tick applies prices before requesting the canonical wire batch", async () => {
  const source = await readFile(WORKER_JOBS, "utf8");
  const jobStart = source.indexOf('jobName: "stocks.tick"');
  const applyStart = source.indexOf("const applied =", jobStart);
  const wireStart = source.indexOf("const announcement =", applyStart);
  assert.ok(jobStart >= 0 && applyStart > jobStart && wireStart > applyStart);
  const stockJob = source.slice(jobStart, wireStart);
  assert.match(stockJob, /applyNovexStockMarketTick/);
  assert.match(stockJob, /previewNovexStockMarketTick/);
  assert.match(stockJob, /applyScheduledStockTick/);
});

test("NOVEX price response reads state, prices and flow from one Mongo snapshot", async () => {
  const [shared, data] = await Promise.all([
    readFile(SHARED_STOCK_MARKET, "utf8"),
    readFile(STOCK_DATA_BUILDERS, "utf8"),
  ]);
  const snapshotStart = shared.indexOf("export async function getStockMarketSnapshot");
  const snapshotEnd = shared.indexOf("export function parseStockMarketShadowState", snapshotStart);
  const snapshot = shared.slice(snapshotStart, snapshotEnd);
  assert.match(snapshot, /session\.withTransaction/);
  assert.match(snapshot, /readConcern: \{ level: "snapshot" \}/);
  assert.match(snapshot, /listPendingStockFlowSignals\(\{ session \}\)/);
  assert.match(data, /snapshot\?\.flowSignals/);
  assert.doesNotMatch(data, /listPendingStockFlowSignals/);
});

test("split and capital increase factors preserve shares, market cap and comparable enterprise value", async () => {
  const [data, hooks, marketIndex, stockInfo] = await Promise.all([
    readFile(STOCK_DATA_BUILDERS, "utf8"),
    readFile(STOCK_QUERY_HOOKS, "utf8"),
    readFile(STOCK_MARKET_INDEX, "utf8"),
    readFile(STOCK_INFO, "utf8"),
  ]);
  assert.match(data, /cumulativeSplitFactor: row\?\.cumulativeSplitFactor \?\? 1/);
  assert.match(hooks, /cumulativeSplitFactor: number/);
  assert.match(hooks, /cumulativeCapitalIncreaseFactor: number/);
  assert.match(
    marketIndex,
    /baseSharesOutstanding \*[\s\S]*cumulativeSplitFactor \*[\s\S]*cumulativeCapitalIncreaseFactor/,
  );
  assert.match(marketIndex, /item\.basePrice \* item\.baseSharesOutstanding/);
  assert.match(stockInfo, /const totalFactor = safeSplitFactor \* safeCapitalIncreaseFactor/);
  assert.match(stockInfo, /comparableCurrentPrice = safeCurrentPrice \* totalFactor/);
  assert.match(stockInfo, /safeCurrentPrice \* sharesOutstanding/);
});

test("economic history sequence survives the API DTO and newest-first UI ordering", async () => {
  const [data, hooks, client] = await Promise.all([
    readFile(STOCK_DATA_BUILDERS, "utf8"),
    readFile(STOCK_QUERY_HOOKS, "utf8"),
    readFile(STOCK_TRADE_CLIENT, "utf8"),
  ]);
  assert.match(data, /effectiveSequence: r\.effectiveSequence/);
  assert.match(data, /effectiveSequence: row\.effectiveSequence/);
  assert.match(
    data,
    /\(b\.effectiveSequence \?\? 0\) - \(a\.effectiveSequence \?\? 0\)/,
  );
  assert.match(hooks, /effectiveSequence\?: number/);
  assert.match(
    client,
    /\(b\.effectiveSequence \?\? 0\) - \(a\.effectiveSequence \?\? 0\)/,
  );
});

test("the web tick route is an explicit manual recovery endpoint", async () => {
  const source = await readFile(TICK_ROUTE, "utf8");
  assert.match(source, /searchParams\.get\("job"\)/);
  assert.match(source, /requestedJob !== "stocks"/);
  assert.match(source, /owner: "manual-recovery"/);
  assert.doesNotMatch(source, /LEGACY_CRON_|owner.*vercel/);
});

test("GM recovery atomically queues worker ownership instead of mutating prices in the API", async () => {
  const source = await readFile(RECOVERY_ROUTE, "utf8");
  const operation = source.indexOf("executeEconomicOperationResult");
  const request = source.indexOf(
    "await enqueueStockMarketRecoveryRequest(",
    operation,
  );
  const audit = source.indexOf("await enqueueGmAdminAudit(", request);
  assert.ok(operation >= 0 && request > operation && audit > request);
  assert.doesNotMatch(source, /applyNovexStockMarketTick/);
  assert.doesNotMatch(source, /notifyScheduledStockMarketWire/);
  assert.match(source, /status: 202/);
});

test("the web producer only persists the scheduled wire desired state", async () => {
  const source = await readFile(STATE_DB, "utf8");
  assert.match(source, /stock_discord_market_wires/);
  assert.match(source, /SCHEDULED_WIRE_ID = "scheduled"/);
  assert.match(source, /desiredPayloads/);
  assert.match(source, /requestedRevision/);
  assert.doesNotMatch(source, /fetch\(|createDiscord|deleteDiscord/);
  assert.doesNotMatch(source, /acquireScheduledStockMarketWireLease/);
});

test("the worker creates a replacement before retiring the active wire", async () => {
  const source = await readFile(WORKER_DESIRED_STATE, "utf8");
  const createAt = source.indexOf("await createDiscordWebhookMessage(");
  const activateAt = source.indexOf("activationAttempted = true", createAt);
  const deleteAt = source.indexOf("for (const messageId of previousIds)", activateAt);

  assert.ok(createAt >= 0 && activateAt > createAt && deleteAt > activateAt);
  assert.match(source, /replacementMessageIds/);
  assert.match(source, /staleMessageIds/);
});

test("GM special disclosures enqueue a dedicated outbox event", async () => {
  const source = await readFile(ADMIN_PRICE_ROUTE, "utf8");
  assert.match(source, /enqueueStockManualInterventionWebhook/);
  assert.doesNotMatch(source, /notifyStockManualIntervention/);
  assert.doesNotMatch(source, /requestScheduledStockMarketWireSync/);
  assert.doesNotMatch(source, /deleteScheduledStockMarketWireMessage/);
});

test("GM manual price mutation commits quote, history and outboxes in one idempotent operation", async () => {
  const [route, hook, client] = await Promise.all([
    readFile(ADMIN_PRICE_ROUTE, "utf8"),
    readFile(STOCK_MUTATION_HOOK, "utf8"),
    readFile(STOCK_ADMIN_CLIENT, "utf8"),
  ]);
  const keyIndex = route.indexOf("readIdempotencyKey(request)");
  const operationIndex = route.indexOf(
    "executeEconomicOperationResult<ManualStockPriceOperationBody>",
    keyIndex,
  );
  const priceIndex = route.indexOf("await updateStockPrice(", operationIndex);
  const priceSessionIndex = route.indexOf(
    "{ session: dbSession }",
    priceIndex,
  );
  const historyIndex = route.indexOf(
    "await recordStockPriceHistory(",
    priceSessionIndex,
  );
  const historySessionIndex = route.indexOf(
    "session: dbSession",
    historyIndex,
  );
  const auditIndex = route.indexOf(
    "await enqueueGmAdminAudit(",
    historySessionIndex,
  );
  const webhookIndex = route.indexOf(
    "await enqueueStockManualInterventionWebhook(",
    auditIndex,
  );
  const completionIndex = route.indexOf("return {", webhookIndex);
  const replayIndex = route.indexOf(
    "if (operation.replayed)",
    completionIndex,
  );

  assert.ok(keyIndex > -1, "Idempotency-Key 검증 누락");
  assert.ok(operationIndex > keyIndex, "경제 operation claim 누락");
  assert.ok(priceIndex > operationIndex, "가격 mutation 누락");
  assert.ok(priceSessionIndex > priceIndex, "가격 mutation session 누락");
  assert.ok(historyIndex > priceSessionIndex, "history append 순서 오류");
  assert.ok(historySessionIndex > historyIndex, "history session 누락");
  assert.ok(auditIndex > historySessionIndex, "감사 outbox 누락");
  assert.ok(webhookIndex > auditIndex, "market-wire outbox 누락");
  assert.ok(completionIndex > webhookIndex, "outbox 전 operation 완료 금지");
  assert.ok(replayIndex > completionIndex, "replay outbox 복구 누락");
  assert.match(route, /operationKey: `stocks\.manual:\$\{requestId\}`/);
  assert.match(route, /dedupeKey: auditDedupeKey/);
  assert.match(
    hook,
    /useUpdateStockPrice[\s\S]*"Idempotency-Key": operationId/,
  );
  assert.match(
    client,
    /retainIdempotencyOperation\([\s\S]*"stock-price-update"[\s\S]*priceOperationRef\.current = operation/,
  );
  assert.match(
    client,
    /onSuccess:[\s\S]*clearRetainedIdempotencyOperation\([\s\S]*operation\.key/,
  );
});

test("forced scheduled ticks reuse one operation id until success", async () => {
  const [hook, client] = await Promise.all([
    readFile(STOCK_MUTATION_HOOK, "utf8"),
    readFile(STOCK_ADMIN_CLIENT, "utf8"),
  ]);

  assert.match(
    hook,
    /RunScheduledStockTickInput[\s\S]*force: true; operationId: string/,
  );
  assert.match(
    client,
    /forceTickOperationIdRef\.current \?\? crypto\.randomUUID\(\)/,
  );
  assert.match(
    client,
    /tickMutation\.mutate\([\s\S]*\{ force: true, operationId \}[\s\S]*forceTickOperationIdRef\.current = null/,
  );
});

test("disabled or shadow NOVEX preserves browser preferences without server migration", async () => {
  const [route, mutation, detail] = await Promise.all([
    readFile(STOCK_PREFERENCES_ROUTE, "utf8"),
    readFile(STOCK_PREFERENCES_MUTATION, "utf8"),
    readFile(STOCK_TRADE_CLIENT, "utf8"),
  ]);

  assert.match(route, /novexEnabled: isNovexV2Enabled\(\)/);
  const putStart = route.indexOf("export async function PUT");
  const enabledGuard = route.indexOf("if (!isNovexV2Enabled())", putStart);
  const operationStart = route.indexOf("executeEconomicOperationResult", enabledGuard);
  assert.ok(putStart >= 0 && enabledGuard > putStart && operationStart > enabledGuard);
  assert.match(route.slice(enabledGuard, operationStart), /status: 409/);

  const migrationEffect = mutation.indexOf("useEffect(() =>");
  const enabledCheck = mutation.indexOf("!query.data.novexEnabled", migrationEffect);
  const migrateMutation = mutation.indexOf("update.mutate", enabledCheck);
  assert.ok(
    migrationEffect >= 0 && enabledCheck > migrationEffect && migrateMutation > enabledCheck,
  );

  assert.match(detail, /alertRules\.novexEnabled \? \(/);
  assert.match(detail, /브라우저 조건 표시/);
  assert.match(detail, /<StockMarketPreferencesPanel ticker=\{ticker\} \/>/);
});

test("NOVEX writers are server-gated, while corporate action rollback remains available", async () => {
  const [routes, cancelRoute, legacyPrice, adminClient] = await Promise.all([
    Promise.all(NOVEX_ADMIN_MUTATION_ROUTES.map((route) => readFile(route, "utf8"))),
    readFile(CORPORATE_ACTION_CANCEL_ROUTE, "utf8"),
    readFile(ADMIN_PRICE_ROUTE, "utf8"),
    readFile(STOCK_ADMIN_CLIENT, "utf8"),
  ]);
  for (const route of routes) {
    assert.match(route, /requireRole\([\s\S]*"GM"/);
    assert.match(route, /if \(!isNovexV2Enabled\(\)\)[\s\S]*status: 409/);
  }
  assert.match(cancelRoute, /requireRole\([\s\S]*"GM"/);
  assert.doesNotMatch(cancelRoute, /if \(!isNovexV2Enabled\(\)\)/);
  assert.match(
    legacyPrice,
    /requireRole\([\s\S]*if \(isNovexV2Enabled\(\)\)[\s\S]*status: 409/,
  );
  assert.match(
    adminClient,
    /novexMode === "enabled" \? \([\s\S]*<StockNovexOperationsPanels[\s\S]*<StockScheduledEventsPanel/,
  );
});
