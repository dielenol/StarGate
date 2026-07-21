import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const originalMongoUri = process.env.MONGODB_URI;
process.env.MONGODB_URI =
  originalMongoUri ?? "mongodb://127.0.0.1:27017/stargate-test";
const { buildScheduledStockTickSummaryFromHistory } = await import(
  "../scheduled-tick.ts"
);
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

function row(overrides) {
  return {
    ticker: "TWS",
    price: 105,
    prevPrice: 100,
    eventText: "정기 변동 +5.00%",
    eventTier: "routine",
    source: "scheduled",
    createdAt: new Date("2026-07-21T03:00:00.000Z"),
    ...overrides,
  };
}

test("recovery uses each ticker's latest scheduled row and preserves event tier", () => {
  const summary = buildScheduledStockTickSummaryFromHistory(
    "2026-07-21",
    [
      row({ price: 102, createdAt: new Date("2026-07-21T03:00:00.000Z") }),
      row({
        price: 130,
        prevPrice: 102,
        eventText: "국가 단위 장기 군납 계약 수주 +27.45%",
        eventTier: "shock",
        createdAt: new Date("2026-07-21T04:00:00.000Z"),
      }),
    ],
    { requireComplete: false },
  );

  assert.equal(summary.results.length, 1);
  assert.deepEqual(summary.results[0], {
    ticker: "TWS",
    previousPrice: 102,
    price: 130,
    changePercent: (28 / 102) * 100,
    eventText: "국가 단위 장기 군납 계약 수주 +27.45%",
    eventTier: "shock",
    status: "updated",
  });
});

test("legacy history without eventTier has a safe display fallback", () => {
  const summary = buildScheduledStockTickSummaryFromHistory(
    "2026-07-21",
    [
      row({ eventTier: undefined }),
      row({
        ticker: "STM",
        price: 48,
        prevPrice: 50,
        eventText: "물류센터 파업 장기화 -4.00%",
        eventTier: undefined,
      }),
    ],
    { requireComplete: false },
  );

  assert.deepEqual(
    summary.results.map((result) => [result.ticker, result.eventTier]),
    [
      ["TWS", "routine"],
      ["STM", "scenario"],
    ],
  );
});

test("automatic recovery waits until all catalog tickers have scheduled history", () => {
  const summary = buildScheduledStockTickSummaryFromHistory("2026-07-21", [
    row({}),
  ]);
  assert.equal(summary, null);
});
