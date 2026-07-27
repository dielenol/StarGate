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
const {
  applyScheduledStockTick,
  buildScheduledStockTickSummaryFromHistory,
} = await import("../scheduled-tick.ts");
const { STOCK_CATALOG } = await import("../catalog.ts");
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

test("100 concurrent scheduled runs apply one ticker/date operation each", async () => {
  const currentByTicker = new Map(
    STOCK_CATALOG.map((meta) => [
      meta.ticker,
      {
        ticker: meta.ticker,
        price: meta.basePrice,
        prevPrice: meta.basePrice,
        eventText: "seed",
        lastUpdate: "2026-07-26 12:00",
      },
    ]),
  );
  const operationPromises = new Map();
  const appliedByTicker = new Map();
  const operationKeys = new Set();

  const applyMutation = async (input) => {
    operationKeys.add(input.operationKey);
    const existing = operationPromises.get(input.operationKey);
    if (existing) {
      const outcome = await existing;
      return { ...outcome, applied: false };
    }

    const operation = (async () => {
      await Promise.resolve();
      const current = currentByTicker.get(input.ticker);
      const first = input.calculate(current);
      const retry = input.calculate(current);
      assert.deepEqual(retry, first, "transaction retry must be deterministic");
      const price = {
        ...current,
        prevPrice: current.price,
        price: first.price,
        eventText: first.eventText,
      };
      currentByTicker.set(input.ticker, price);
      appliedByTicker.set(
        input.ticker,
        (appliedByTicker.get(input.ticker) ?? 0) + 1,
      );
      return {
        applied: true,
        initialized: false,
        price,
        history: {
          operationKey: input.operationKey,
          ticker: input.ticker,
          price: first.price,
          prevPrice: current.price,
          eventText: first.eventText,
          eventTier: first.eventTier,
          source: "scheduled",
          createdAt: new Date(),
        },
      };
    })();
    operationPromises.set(input.operationKey, operation);
    return operation;
  };

  const summaries = await Promise.all(
    Array.from({ length: 100 }, () =>
      applyScheduledStockTick(
        {},
        {
          applyMutation,
          random: () => 0.5,
        },
      ),
    ),
  );

  assert.equal(
    summaries
      .flatMap((summary) => summary.results)
      .filter((result) => result.status === "updated").length,
    STOCK_CATALOG.length,
  );
  assert.equal(operationKeys.size, STOCK_CATALOG.length);
  assert.ok(
    Array.from(operationKeys).every((key) =>
      /^stocks\.tick:\d{4}-\d{2}-\d{2}:[A-Z0-9]+$/.test(key),
    ),
  );
  for (const meta of STOCK_CATALOG) {
    assert.equal(appliedByTicker.get(meta.ticker), 1);
  }
});
