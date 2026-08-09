import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_ROUTE = new URL(
  "../../../app/api/cron/shop/refresh/route.ts",
  import.meta.url,
);
const NOTIFICATION = new URL("../restock-notification.ts", import.meta.url);
const OUTBOX = new URL("../../outbox/integration.ts", import.meta.url);
const WORKER_JOBS = new URL(
  "../../../../stargate-worker/src/jobs/default-handlers.ts",
  import.meta.url,
);

test("shop refresh applies daily stock before requesting the canonical notice", async () => {
  const source = await readFile(REFRESH_ROUTE, "utf8");
  assert.match(
    source,
    /ensureDailyStockRefresh\(\)[\s\S]*notifyDailyShopRestock\(summary\.today\)/,
  );
  assert.match(source, /notification\.status !== "failed"/);
  assert.match(source, /status: ok \? 200 : 500/);
});

test("daily shop restock uses one singleton revision and lease state", async () => {
  const source = await readFile(NOTIFICATION, "utf8");
  assert.match(source, /STATE_ID = "daily-shop-restock"/);
  assert.match(source, /requestedRevision/);
  assert.match(source, /syncedRevision/);
  assert.match(source, /desiredPayloads/);
  assert.match(source, /messageIds/);
  assert.match(source, /cleanupMessageIds/);
  assert.match(
    source,
    /catalog\.every\(\(item\) => stockByItemId\.has\(item\.slug\)\)/,
  );
  assert.match(source, /loadRuntimeShopCatalog\(\)/);
  assert.doesNotMatch(source, /daily-shop-restock:\$\{today\}/);
  assert.doesNotMatch(source, /sentAt/);
  assert.match(
    source,
    /deleteMessage: deleteDailyShopRestockDiscordMessage,[\s\S]*createMessage: createDailyShopRestockDiscordMessage/,
  );
  assert.doesNotMatch(source, /DISCORD_BOT_TOKEN|webhook-message-pruner/);
});

test("shop restock scheduled ownership belongs to the worker", async () => {
  const source = await readFile(WORKER_JOBS, "utf8");
  assert.match(
    source,
    /jobName: "shop\.refresh"[\s\S]*ensureDailyStockRefresh\([\s\S]*requestDailyShopRestockState\(/,
  );
});

test("manual reorder and fulfillment messages use durable outbox kinds", async () => {
  const source = await readFile(OUTBOX, "utf8");
  assert.match(source, /kind: "SHOP_REORDER_REQUEST_WEBHOOK"/);
  assert.match(source, /kind: "SHOP_REORDER_FULFILLED_WEBHOOK"/);
  assert.doesNotMatch(source, /notifyShopReorderRequest|notifyShopReorderFulfilled/);
});
