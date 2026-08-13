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
  let stockImpactConsumeCalls = 0;

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
      const context = input.loadContext
        ? await input.loadContext({ inTransaction: () => true })
        : undefined;
      const first = input.calculate(current, context);
      const retry = input.calculate(current, context);
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
        { sodaStockImpactEnabled: true },
        {
          applyMutation,
          claimScheduledEvent: async () => null,
          consumeStockImpact: async () => {
            stockImpactConsumeCalls += 1;
            return { soldQuantity: 36, eventIds: ["mrbeast-2026"] };
          },
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
  assert.equal(stockImpactConsumeCalls, 1);
  const updatedStm = summaries
    .flatMap((summary) => summary.results)
    .find((result) => result.ticker === "STM" && result.status === "updated");
  assert.match(updatedStm.eventText, /소다 36개 판매 \+3\.60%p/);
  const updatedTws = summaries
    .flatMap((summary) => summary.results)
    .find((result) => result.ticker === "TWS" && result.status === "updated");
  assert.doesNotMatch(updatedTws.eventText, /미스터비스트|최종/);
});

test("GM force tick은 소다 판매량을 조기 소비하지 않는다", async () => {
  let consumeCalls = 0;
  const summary = await applyScheduledStockTick(
    {
      force: true,
      operationId: "gm-manual-test",
      now: new Date("2026-08-14T03:00:00.000Z"),
      sodaStockImpactEnabled: true,
    },
    {
      consumeStockImpact: async () => {
        consumeCalls += 1;
        return { soldQuantity: 10, eventIds: ["mrbeast-2026"] };
      },
      random: () => 0.5,
      applyMutation: async (input) => {
        assert.equal(input.loadContext, undefined);
        const current = {
          ticker: input.ticker,
          price: input.initialPrice,
          prevPrice: input.initialPrice,
          eventText: "seed",
          lastUpdate: input.initialLastUpdateKst,
        };
        const mutation = input.calculate(current, undefined);
        return {
          applied: true,
          initialized: false,
          price: { ...current, ...mutation },
          history: {
            operationKey: input.operationKey,
            ticker: input.ticker,
            prevPrice: current.price,
            price: mutation.price,
            eventText: mutation.eventText,
            eventTier: mutation.eventTier,
            source: "scheduled",
            createdAt: new Date(),
          },
        };
      },
    },
  );

  assert.equal(consumeCalls, 0);
  assert.ok(summary.results.every((result) => result.status === "updated"));
  assert.ok(
    summary.results.every(
      (result) => !result.eventText.includes("미스터비스트"),
    ),
  );
  assert.ok(
    summary.results.every(
      (result) => !result.eventText.includes("미국 식약청"),
    ),
  );
});

test("backfill gate가 닫혀 있으면 자동 tick도 소다 판매량을 소비하지 않는다", async () => {
  let consumeCalls = 0;
  await applyScheduledStockTick(
    {},
    {
      claimScheduledEvent: async () => null,
      consumeStockImpact: async () => {
        consumeCalls += 1;
        return { soldQuantity: 10, eventIds: ["mrbeast-2026"] };
      },
      random: () => 0.5,
      applyMutation: async (input) => {
        assert.equal(typeof input.loadContext, "function");
        const current = {
          ticker: input.ticker,
          price: input.initialPrice,
          prevPrice: input.initialPrice,
          eventText: "seed",
          lastUpdate: input.initialLastUpdateKst,
        };
        const context = await input.loadContext({ inTransaction: () => true });
        const mutation = input.calculate(current, context);
        return {
          applied: true,
          initialized: false,
          price: { ...current, ...mutation },
          history: {
            operationKey: input.operationKey,
            ticker: input.ticker,
            prevPrice: current.price,
            price: mutation.price,
            eventText: mutation.eventText,
            eventTier: mutation.eventTier,
            source: "scheduled",
            createdAt: new Date(),
          },
        };
      },
    },
  );
  assert.equal(consumeCalls, 0);
});

test("2026-08-14 STM 정기 공시는 직전가를 절반으로 만들고 규제 적발 사유를 남긴다", async () => {
  let consumeCalls = 0;
  const summary = await applyScheduledStockTick(
    {
      now: new Date("2026-08-14T03:00:00.000Z"),
      sodaStockImpactEnabled: true,
    },
    {
      claimScheduledEvent: async () => null,
      random: () => 0.5,
      consumeStockImpact: async () => {
        consumeCalls += 1;
        return { soldQuantity: 50, eventIds: ["mrbeast-2026"] };
      },
      applyMutation: async (input) => {
        const currentPrice = input.ticker === "STM" ? 5.4 : input.initialPrice;
        const current = {
          ticker: input.ticker,
          price: currentPrice,
          prevPrice: currentPrice,
          eventText: "seed",
          lastUpdate: input.initialLastUpdateKst,
        };
        const context = input.loadContext
          ? await input.loadContext({ inTransaction: () => true })
          : undefined;
        const mutation = input.calculate(current, context);
        return {
          applied: true,
          initialized: false,
          price: { ...current, ...mutation },
          history: {
            operationKey: input.operationKey,
            ticker: input.ticker,
            prevPrice: current.price,
            price: mutation.price,
            eventText: mutation.eventText,
            eventTier: mutation.eventTier,
            source: "scheduled",
            createdAt: new Date(),
          },
        };
      },
    },
  );

  const stm = summary.results.find((result) => result.ticker === "STM");
  assert.equal(summary.date, "2026-08-14");
  assert.equal(summary.slot, "2026-08-14 12:00");
  assert.equal(stm.previousPrice, 5.4);
  assert.equal(stm.price, 2.7);
  assert.equal(stm.changePercent, -50);
  assert.equal(stm.eventTier, "shock");
  assert.match(stm.eventText, /감사팀·미국 식약청/);
  assert.match(stm.eventText, /소다 함량 미달·불법 원료 적발 -50\.00%/);
  assert.equal(
    consumeCalls,
    0,
    "예약 충격 날의 미반영 판매량은 다음 정기 틱으로 이월해야 한다",
  );
});

test("2026-08-14 12:00 KST 전 non-force 실행은 어떤 정기 history도 만들지 않는다", async () => {
  let mutationCalls = 0;
  await assert.rejects(
    applyScheduledStockTick(
      { now: new Date("2026-08-14T02:59:59.999Z") },
      {
        applyMutation: async () => {
          mutationCalls += 1;
          throw new Error("must not run");
        },
      },
    ),
    (error) => error?.name === "ScheduledStockTickNotDueError",
  );
  assert.equal(mutationCalls, 0);
});

test("GM 예약 이벤트는 지정 정기 틱에서 한 번 claim되고 소다 영향보다 우선한다", async () => {
  let eventClaimCalls = 0;
  let stockImpactConsumeCalls = 0;
  const summary = await applyScheduledStockTick(
    {
      now: new Date("2026-08-15T03:00:00.000Z"),
      sodaStockImpactEnabled: true,
    },
    {
      random: () => 0.5,
      claimScheduledEvent: async (input) => {
        eventClaimCalls += 1;
        return input.ticker === "STM"
          ? {
              _id: "stock-event:2026-08-15:STM",
              ticker: "STM",
              kstDate: "2026-08-15",
              executeAt: new Date("2026-08-15T03:00:00.000Z"),
              changePercent: -25,
              eventText: "감독기관 후속 영업정지 처분",
              eventTier: "shock",
              status: "APPLIED",
              createdBy: { id: "gm", displayName: "GM" },
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null;
      },
      consumeStockImpact: async () => {
        stockImpactConsumeCalls += 1;
        return { soldQuantity: 50, eventIds: ["mrbeast-2026"] };
      },
      applyMutation: async (input) => {
        const currentPrice = input.ticker === "STM" ? 8 : input.initialPrice;
        const current = {
          ticker: input.ticker,
          price: currentPrice,
          prevPrice: currentPrice,
          eventText: "seed",
          lastUpdate: input.initialLastUpdateKst,
        };
        const context = input.loadContext
          ? await input.loadContext({ inTransaction: () => true })
          : undefined;
        const mutation = input.calculate(current, context);
        return {
          applied: true,
          initialized: false,
          price: { ...current, ...mutation },
          history: {
            operationKey: input.operationKey,
            ticker: input.ticker,
            prevPrice: current.price,
            price: mutation.price,
            eventText: mutation.eventText,
            eventTier: mutation.eventTier,
            source: "scheduled",
            createdAt: new Date(),
          },
        };
      },
    },
  );

  const stm = summary.results.find((result) => result.ticker === "STM");
  assert.equal(stm.previousPrice, 8);
  assert.equal(stm.price, 6);
  assert.equal(stm.changePercent, -25);
  assert.equal(stm.eventTier, "shock");
  assert.match(stm.eventText, /영업정지 처분 -25\.00%/);
  assert.equal(eventClaimCalls, STOCK_CATALOG.length);
  assert.equal(stockImpactConsumeCalls, 0);
});
