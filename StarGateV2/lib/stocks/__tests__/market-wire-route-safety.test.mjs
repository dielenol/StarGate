import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TICK_ROUTE = new URL(
  "../../../app/api/cron/stocks/tick/route.ts",
  import.meta.url,
);
const RETRY_ROUTE = new URL(
  "../../../app/api/cron/stocks/discord-wire/route.ts",
  import.meta.url,
);
const ADMIN_PRICE_ROUTE = new URL(
  "../../../app/api/erp/admin/stocks/prices/route.ts",
  import.meta.url,
);
const STATE_DB = new URL("../../db/stock-market-wire.ts", import.meta.url);
const VERCEL_CONFIG = new URL("../../../vercel.json", import.meta.url);

test("the scheduled tick applies prices before requesting the canonical wire batch", async () => {
  const source = await readFile(TICK_ROUTE, "utf8");
  assert.match(
    source,
    /applyScheduledStockTick\(\)[\s\S]*notifyScheduledStockMarketWire\(summary\)/,
  );
});

test("the stock wire has a secured recurring retry consumer", async () => {
  const [route, config] = await Promise.all([
    readFile(RETRY_ROUTE, "utf8"),
    readFile(VERCEL_CONFIG, "utf8"),
  ]);
  assert.match(route, /authorization/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /syncScheduledStockMarketWireMessages/);
  assert.match(route, /recoverScheduledStockMarketWireForToday/);
  assert.match(config, /\/api\/cron\/stocks\/discord-wire/);
});

test("the scheduled wire singleton persists desired payloads and message ids", async () => {
  const source = await readFile(STATE_DB, "utf8");
  assert.match(source, /stock_discord_market_wires/);
  assert.match(source, /SCHEDULED_WIRE_ID = "scheduled"/);
  assert.match(source, /desiredPayloads/);
  assert.match(source, /messageIds/);
  assert.match(source, /cleanupMessageIds/);
  assert.match(source, /requestedRevision/);
  assert.match(source, /leaseExpiresAt/);
});

test("GM special disclosures remain outside scheduled batch replacement", async () => {
  const source = await readFile(ADMIN_PRICE_ROUTE, "utf8");
  assert.match(source, /notifyStockManualIntervention/);
  assert.doesNotMatch(source, /requestScheduledStockMarketWireSync/);
  assert.doesNotMatch(source, /deleteScheduledStockMarketWireMessage/);
});
