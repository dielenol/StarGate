import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_ROUTE = new URL(
  "../../../app/api/cron/shop/refresh/route.ts",
  import.meta.url,
);
const RETRY_ROUTE = new URL(
  "../../../app/api/cron/shop/discord-restock/route.ts",
  import.meta.url,
);
const NOTIFICATION = new URL("../restock-notification.ts", import.meta.url);
const DISCORD = new URL("../../discord.ts", import.meta.url);
const VERCEL_CONFIG = new URL("../../../vercel.json", import.meta.url);

test("shop refresh applies daily stock before requesting the canonical notice", async () => {
  const source = await readFile(REFRESH_ROUTE, "utf8");
  assert.match(
    source,
    /ensureDailyStockRefresh\(\)[\s\S]*notifyDailyShopRestock\(summary\.today\)/,
  );
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
    /SHOP_CATALOG\.every\(\(item\) => stockByItemId\.has\(item\.slug\)\)/,
  );
  assert.doesNotMatch(source, /daily-shop-restock:\$\{today\}/);
  assert.doesNotMatch(source, /sentAt/);
});

test("shop restock has a secured recurring recovery consumer", async () => {
  const [route, config] = await Promise.all([
    readFile(RETRY_ROUTE, "utf8"),
    readFile(VERCEL_CONFIG, "utf8"),
  ]);
  assert.match(route, /authorization/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /recoverDailyShopRestockDiscordMessage/);
  assert.match(route, /syncDailyShopRestockDiscordMessage/);
  assert.match(config, /\/api\/cron\/shop\/discord-restock/);
});

test("manual reorder and fulfillment messages remain outside canonical cleanup", async () => {
  const source = await readFile(DISCORD, "utf8");
  assert.match(source, /notifyShopReorderRequest/);
  assert.match(source, /notifyShopReorderFulfilled/);
  assert.doesNotMatch(
    source.slice(source.indexOf("notifyShopReorderRequest")),
    /deleteDailyShopRestockDiscordMessage/,
  );
});
