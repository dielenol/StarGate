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

test("the worker scheduled tick applies prices before requesting the canonical wire batch", async () => {
  const source = await readFile(WORKER_JOBS, "utf8");
  assert.match(
    source,
    /jobName: "stocks\.tick"[\s\S]*applyScheduledStockTick\(\{[\s\S]*requestStockMarketWireState\(/,
  );
});

test("the web tick route is an explicit manual recovery endpoint", async () => {
  const source = await readFile(TICK_ROUTE, "utf8");
  assert.match(source, /searchParams\.get\("job"\)/);
  assert.match(source, /requestedJob !== "stocks"/);
  assert.match(source, /owner: "manual-recovery"/);
  assert.doesNotMatch(source, /LEGACY_CRON_|owner.*vercel/);
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
