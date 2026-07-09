import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

function resolveLocalModule(specifier, parentURL) {
  const basePath = specifier.startsWith("@/")
    ? resolve(rootDir, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fileURLToPath(parentURL)), specifier)
      : null;

  if (!basePath) return null;

  for (const extension of extensionCandidates) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }

  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = resolveLocalModule(specifier, context.parentURL);
    if (resolved) return { url: resolved, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { notifyScheduledStockMarketWire } = await import("../market-wire.ts");

const ENV_KEYS = [
  "DISCORD_WEBHOOK_STOCK_URL",
  "DISCORD_STOCK_WEBHOOK_URL",
  "DISCORD_WEBHOOK_STOCK_AVATAR_URL",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeResult(overrides) {
  return {
    ticker: "TWS",
    previousPrice: 100,
    price: 105,
    changePercent: 5,
    eventText: "정기 변동 +5.00%",
    eventTier: "routine",
    status: "updated",
    ...overrides,
  };
}

test("scheduled stock market wire posts four visible one-embed messages", async (t) => {
  const originalFetch = globalThis.fetch;
  const envSnapshot = snapshotEnv();
  const calls = [];

  process.env.DISCORD_WEBHOOK_STOCK_URL = "https://discord.test/stock";
  delete process.env.DISCORD_STOCK_WEBHOOK_URL;

  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 204 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  const result = await notifyScheduledStockMarketWire({
    date: "2026-07-09",
    slot: "2026-07-09 12:00",
    results: [
      makeResult({ ticker: "TWS", previousPrice: 100, price: 105 }),
      makeResult({ ticker: "STM", previousPrice: 50, price: 48, changePercent: -4 }),
      makeResult({ ticker: "SSR", previousPrice: 30, price: 31, changePercent: 3.33 }),
      makeResult({ ticker: "MSF", previousPrice: 80, price: 78, changePercent: -2.5 }),
    ],
  });

  assert.deepEqual(result, { status: "sent", embedCount: 4, messageCount: 4 });
  assert.equal(calls.length, 4);
  assert.deepEqual(
    calls.map((call) => call.body.embeds.length),
    [1, 1, 1, 1],
  );
  assert.match(calls[0].body.content, /ORDO-NET 주식 거래소 바로가기/);
  assert.equal(Object.hasOwn(calls[1].body, "content"), false);
  assert.deepEqual(
    calls.map((call) => call.body.embeds[0].title),
    [
      "재무기구 정기 시세 공시 · 2026-07-09",
      "상승 마감 장부",
      "하락 마감 장부",
      "보합 및 감시실 특이사항",
    ],
  );
});
