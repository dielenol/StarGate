import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustNovexHistoryForSplits,
  buildNovexAutoDisclosureQueue,
  calculateNovexPrice,
  calculateNovexSeasonPerformance,
  enumerateNovexSlotsAfter,
  isNovexRegularSessionDate,
  latestDueNovexSlot,
  modifiedDietzReturn,
  novexSeasonDateRangeForStart,
  normalizeNovexPositionForSplits,
  nextNovexMarketActionAt,
  resolveNovexTradingWindow,
  rollNovexAutoDisclosureCount,
  shouldDeferNovexRoundForEarlyClose,
} from "../dist/domain/novex-market.js";
import {
  remainingNovexAutoQueueHours,
  resolveNovexV2Mode,
  selectNovexSeasonActivationForMergedSlots,
  shouldSkipNovexRoundLedger,
} from "../dist/operations/stocks-tick.js";
import { processPendingStockDividendPayouts } from "../dist/operations/stock-dividends.js";
import { combineStockDisclosuresForTicker } from "../../shared-db/dist/index.js";

test("NOVEX 회차와 격주 정규 세션 폐장 규칙을 KST로 계산한다", () => {
  assert.equal(latestDueNovexSlot(new Date("2026-08-24T04:15:00Z")), "2026-08-24 13:00");
  assert.deepEqual(
    enumerateNovexSlotsAfter("2026-08-23 13:00", "2026-08-24 09:00"),
    ["2026-08-23 18:00", "2026-08-23 23:00", "2026-08-24 09:00"],
  );
  assert.deepEqual(
    enumerateNovexSlotsAfter(undefined, "2026-08-24 13:00"),
    ["2026-08-24 09:00", "2026-08-24 13:00"],
  );
  assert.equal(isNovexRegularSessionDate("2026-08-23"), true);
  assert.equal(isNovexRegularSessionDate("2026-09-06"), true);
  assert.equal(isNovexRegularSessionDate("2026-08-30"), false);
  assert.deepEqual(novexSeasonDateRangeForStart("2026-08-24"), {
    startsOn: "2026-08-24",
    endsOn: "2026-09-06",
  });
  assert.equal(novexSeasonDateRangeForStart("2026-08-25"), null);
  assert.equal(
    nextNovexMarketActionAt("2026-08-23 18:00", true).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );
  assert.equal(
    nextNovexMarketActionAt("2026-08-23 18:00", false).toISOString(),
    "2026-08-23T14:00:00.000Z",
  );
  const fallback = resolveNovexTradingWindow({
    kstDate: "2026-08-23",
    regularSessionStarts: [],
  });
  assert.equal(fallback.closesAt.toISOString(), "2026-08-23T09:00:00.000Z");
  assert.equal(fallback.warning, "REGULAR_SESSION_MISSING");
  const ambiguous = resolveNovexTradingWindow({
    kstDate: "2026-08-23",
    regularSessionStarts: [new Date("2026-08-23T06:00:00Z"), new Date("2026-08-23T07:00:00Z")],
  });
  assert.equal(ambiguous.warning, "REGULAR_SESSION_AMBIGUOUS");
  const exception = resolveNovexTradingWindow({
    kstDate: "2026-08-23",
    regularSessionStarts: [],
    exception: { _id: "x", kstDate: "2026-08-23", mode: "CANCEL_EARLY_CLOSE", createdById: "gm", createdAt: new Date(0), updatedAt: new Date(0) },
  });
  assert.equal(exception.closesAt.toISOString(), "2026-08-23T14:00:00.000Z");
  assert.equal(
    shouldDeferNovexRoundForEarlyClose(
      "2026-08-23 18:00",
      new Date("2026-08-23T18:00:00+09:00"),
    ),
    true,
  );
  assert.equal(
    shouldDeferNovexRoundForEarlyClose(
      "2026-08-23 13:00",
      new Date("2026-08-23T18:00:00+09:00"),
    ),
    false,
  );
  assert.equal(
    shouldDeferNovexRoundForEarlyClose(
      "2026-08-24 23:00",
      new Date("2026-08-24T23:00:00+09:00"),
    ),
    false,
  );
});

test("가격 산식은 수급 ±3%, 회차 cap, GM exact override와 structural reference를 지킨다", () => {
  const current = { ticker: "NVS", price: 100, prevPrice: 100, referencePrice: 100, eventText: "", lastUpdate: "" };
  const flow = calculateNovexPrice({ current, flowPercent: 0.03, random: () => 0.5, now: new Date(0) });
  assert.equal(flow.price, 103);
  assert.equal(flow.flowPercent, 0.03);
  const cappedNormal = calculateNovexPrice({
    current: { ...current, price: 50 },
    flowPercent: 0.03,
    random: () => 1,
    now: new Date(0),
  });
  assert.equal(cappedNormal.finalPercent, 0.08);

  const structural = calculateNovexPrice({
    current,
    flowPercent: 0.03,
    random: () => 0.5,
    now: new Date(0),
    disclosure: {
      _id: "auto", title: "구조 변화", body: "", kind: "PRICE", status: "SCHEDULED", source: "AUTO",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 10, structural: true }],
      createdById: "system", createdAt: new Date(0), updatedAt: new Date(0), shock: false,
    },
  });
  assert.equal(structural.price, 112);
  assert.equal(structural.referencePrice, 110);
  assert.equal(structural.finalPercent, 0.12);
  assert.ok(structural.cooldownUntil);

  const mergedStructural = calculateNovexPrice({
    current,
    flowPercent: 0,
    random: () => 0.5,
    now: new Date(0),
    structuralDisclosurePercent: 0.05,
    disclosure: {
      _id: "merged", title: "병합", body: "", kind: "PRICE", status: "SCHEDULED", source: "AUTO",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 2, structural: true }],
      createdById: "system", createdAt: new Date(0), updatedAt: new Date(0),
    },
  });
  assert.equal(mergedStructural.price, 102);
  assert.equal(mergedStructural.referencePrice, 105);

  const gm = calculateNovexPrice({
    current,
    flowPercent: 0.03,
    random: () => 1,
    now: new Date(0),
    disclosure: {
      _id: "gm", title: "GM", body: "", kind: "PRICE", status: "SCHEDULED", source: "GM",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 25, structural: false }],
      createdById: "gm", createdAt: new Date(0), updatedAt: new Date(0),
    },
  });
  assert.equal(gm.price, 125);
  assert.equal(gm.consumeFlow, false);
  assert.equal(gm.pendingBasePercent, 0.03);
  assert.equal(gm.flowPercent, 0);
  const shock = calculateNovexPrice({
    current,
    flowPercent: 0.03,
    random: () => 1,
    now: new Date(0),
    disclosure: {
      _id: "shock", title: "충격", body: "", kind: "PRICE", status: "SCHEDULED", source: "AUTO",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 20, structural: false }],
      createdById: "system", createdAt: new Date(0), updatedAt: new Date(0), shock: true,
    },
  });
  assert.equal(shock.finalPercent, 0.2);
  assert.ok(shock.cooldownUntil);
});

test("유상증자 PRICE 공시는 기본 랜덤·수급 없이 exact structural 조정한다", () => {
  const current = { ticker: "NVS", price: 50, prevPrice: 50, referencePrice: 50 };
  const result = calculateNovexPrice({
    current,
    flowPercent: 0.03,
    disclosure: {
      _id: "rights",
      title: "유상증자 실행",
      body: "투자",
      kind: "PRICE",
      status: "SCHEDULED",
      source: "CORPORATE_ACTION",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 25, structural: true }],
      createdById: "gm",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    random: () => 1,
    now: new Date(0),
  });
  assert.equal(result.price, 62.5);
  assert.equal(result.referencePrice, 62.5);
  assert.equal(result.basePercent, 0);
  assert.equal(result.flowPercent, 0);
  assert.equal(result.consumeFlow, false);
});

test("병합 AUTO+GM 공시는 기본 변동과 수급을 소비하지 않고 합산 지정률만 적용한다", () => {
  const common = {
    title: "공시",
    body: "",
    kind: "PRICE",
    status: "SCHEDULED",
    effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 5, structural: false }],
    createdById: "system",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const combined = combineStockDisclosuresForTicker([
    { ...common, _id: "auto", slotKey: "2026-08-24 13:00", source: "AUTO" },
    { ...common, _id: "gm", slotKey: "2026-08-24 18:00", source: "GM", effects: [{ scope: "TICKER", ticker: "NVS", changePercent: -12, structural: false }] },
  ], "NVS");
  const result = calculateNovexPrice({
    current: { ticker: "NVS", price: 100, prevPrice: 100, referencePrice: 100, eventText: "", lastUpdate: "" },
    flowPercent: 0.03,
    disclosure: combined.disclosure,
    structuralDisclosurePercent: combined.structuralDisclosurePercent,
    random: () => 1,
    now: new Date(0),
  });
  assert.equal(result.finalPercent, -0.07);
  assert.equal(result.price, 93);
  assert.equal(result.consumeFlow, false);
  assert.equal(result.flowPercent, 0);
  assert.equal(result.pendingBasePercent, 0.03);
});

test("자동 공시 분포 경계와 생성 큐는 4건/대형1건/slot-target 충돌 금지를 지킨다", () => {
  assert.deepEqual([0.19, 0.2, 0.54, 0.55, 0.79, 0.8, 0.949, 0.95].map((v) => rollNovexAutoDisclosureCount(() => v)), [0, 1, 1, 2, 2, 3, 3, 4]);
  let seed = 123456;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const queue = buildNovexAutoDisclosureQueue({
    kstDate: "2026-08-25",
    tickers: ["NVS", "TWS", "VFP"],
    existingCount: 0,
    random,
    now: new Date(0),
  });
  assert.ok(queue.length <= 4);
  assert.ok(queue.filter((row) => row.shock).length <= 1);
  for (let i = 0; i < queue.length; i += 1) {
    for (let j = i + 1; j < queue.length; j += 1) {
      if (queue[i].slotKey !== queue[j].slotKey) continue;
      const a = queue[i].effects[0];
      const b = queue[j].effects[0];
      assert.equal(a.scope === b.scope && (a.scope === "MARKET" || a.ticker === b.ticker), false);
    }
  }
  const carriedShockQueue = buildNovexAutoDisclosureQueue({
    kstDate: "2026-08-25",
    tickers: ["NVS", "TWS", "VFP"],
    existingCount: 1,
    existingShockCount: 1,
    random: () => 0.99,
    now: new Date(0),
  });
  assert.ok(carriedShockQueue.every((row) => row.shock !== true));
});

test("장기 Monte Carlo에서 일반 회차 등락은 ±8%이고 가격은 양수로 유지된다", () => {
  let seed = 7;
  const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
  let current = { ticker: "NVS", price: 100, prevPrice: 100, referencePrice: 100, eventText: "", lastUpdate: "" };
  for (let i = 0; i < 20_000; i += 1) {
    const result = calculateNovexPrice({ current, flowPercent: 0, random, now: new Date(i) });
    assert.ok(Math.abs(result.finalPercent) <= 0.08 + Number.EPSILON);
    assert.ok(result.price > 0);
    current = { ...current, prevPrice: current.price, price: result.price, pendingBasePercent: result.pendingBasePercent };
  }
  assert.ok(current.price > 50 && current.price < 150);
});

test("Modified Dietz 연쇄·참가 조건·배지와 split 보정은 인위적 수익을 만들지 않는다", () => {
  assert.equal(modifiedDietzReturn({ openingValue: 100, closingValue: 130, flows: [{ amount: 20, weight: 0.5 }] }), 10 / 110);
  const rows = calculateNovexSeasonPerformance("s1", [
    { characterId: "a", codename: "A", investedValue: 50, buyCount: 1, exposureSlots: 8, periods: [{ openingValue: 100, closingValue: 110, flows: [] }] },
    { characterId: "b", codename: "B", investedValue: 49, buyCount: 1, exposureSlots: 8, periods: [{ openingValue: 100, closingValue: 120, flows: [] }] },
  ], new Date(0));
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].title, "NOVEX 시즌 챔피언");
  assert.equal(rows[1].eligible, false);
  const adjusted = adjustNovexHistoryForSplits([
    { price: 100 },
    { price: 50, splitFactor: 2 },
    { price: 27.5, capitalIncreaseFactor: 2 },
    { price: 30 },
  ]);
  assert.equal(adjusted[0].adjustedPrice, 25);
  assert.equal(adjusted[1].adjustedPrice, 25);
  assert.equal(adjusted[2].adjustedPrice, 27.5);
  assert.equal(adjusted[0].cumulativeSplitFactor, 2);
  assert.equal(adjusted[0].cumulativeCapitalIncreaseFactor, 2);
  assert.deepEqual(normalizeNovexPositionForSplits({ shares: 1, price: 100, cumulativeSplitFactor: 2 }), { shares: 2, price: 50, marketValue: 100 });
});

test("NOVEX mode는 disabled 기본, shadow 무변경, enabled 명시 및 legacy true를 지원한다", () => {
  assert.equal(resolveNovexV2Mode({}), "disabled");
  assert.equal(resolveNovexV2Mode({ mode: "shadow" }), "shadow");
  assert.equal(resolveNovexV2Mode({ mode: "enabled" }), "enabled");
  assert.equal(resolveNovexV2Mode({ legacyEnabled: "true" }), "enabled");
});

test("과거 회차 복구는 이미 지난 자동 공시 슬롯을 새로 만들지 않는다", () => {
  assert.deepEqual(
    remainingNovexAutoQueueHours(
      "2026-08-24",
      13,
      new Date("2026-08-25T20:00:00+09:00"),
    ),
    [],
  );
  assert.deepEqual(
    remainingNovexAutoQueueHours(
      "2026-08-25",
      13,
      new Date("2026-08-25T20:00:00+09:00"),
    ),
    [23],
  );
});

test("누락된 월요일 09시가 13시 또는 다음날 회차에 병합돼도 시즌을 시작한다", () => {
  const monday = {
    _id: "novex-season:2026-08-24",
    startsAt: new Date("2026-08-24T09:00:00+09:00"),
    endsAt: new Date("2026-09-06T18:00:00+09:00"),
    status: "ACTIVE",
    createdAt: new Date(0),
  };
  const candidates = [{ slotKey: "2026-08-24 09:00", season: monday }];
  assert.equal(
    selectNovexSeasonActivationForMergedSlots(
      candidates,
      enumerateNovexSlotsAfter(undefined, "2026-08-24 13:00"),
    )?._id,
    monday._id,
  );
  assert.equal(
    selectNovexSeasonActivationForMergedSlots(
      candidates,
      [
        "2026-08-24 09:00",
        "2026-08-24 13:00",
        "2026-08-24 18:00",
        "2026-08-24 23:00",
        "2026-08-25 09:00",
      ],
    )?._id,
    monday._id,
  );
});

test("회차 장부는 네 회차 모두 공시하고 다음 회차 시각을 넘긴 복구분만 건너뛴다", () => {
  assert.equal(
    shouldSkipNovexRoundLedger(
      "2026-08-24 23:00",
      new Date("2026-08-24T23:59:59+09:00"),
    ),
    false,
  );
  assert.equal(
    shouldSkipNovexRoundLedger(
      "2026-08-24 23:00",
      new Date("2026-08-25T09:00:00+09:00"),
    ),
    true,
  );
  assert.equal(
    shouldSkipNovexRoundLedger(
      "2026-08-24 18:00",
      new Date("2026-08-24T18:05:00+09:00"),
    ),
    false,
  );
  assert.equal(
    shouldSkipNovexRoundLedger(
      "2026-08-24 09:00",
      new Date("2026-08-24T13:00:00+09:00"),
    ),
    true,
  );
});

test("배당 지급 큐는 같은 실행에서 오류 건을 제외하고 다음 worker 실행에서 재시도한다", async () => {
  let repaired = false;
  let brokenPaid = false;
  let brokenAttempts = 0;
  let paidRemaining = 2;
  const payNext = async ({ excludeEntitlementIds }) => {
    if (!brokenPaid && !excludeEntitlementIds.includes("broken")) {
      brokenAttempts += 1;
      if (repaired) {
        brokenPaid = true;
        return { status: "PAID", entitlementId: "broken", amount: 3 };
      }
      return { status: "ERROR", entitlementId: "broken", error: "OWNER_NOT_FOUND" };
    }
    if (paidRemaining > 0) {
      paidRemaining -= 1;
      return { status: "PAID", entitlementId: `paid-${paidRemaining}`, amount: 1 };
    }
    return { status: "EMPTY" };
  };
  const first = await processPendingStockDividendPayouts(100, { payNext });
  assert.deepEqual(first, {
    paid: 2,
    totalAmount: 2,
    errors: 1,
    drained: false,
  });
  assert.equal(brokenAttempts, 1);
  repaired = true;
  const second = await processPendingStockDividendPayouts(100, { payNext });
  assert.deepEqual(second, {
    paid: 1,
    totalAmount: 3,
    errors: 0,
    drained: true,
  });
  assert.equal(brokenAttempts, 2);
});
