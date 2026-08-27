import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateStockOrderFlow,
  evaluateStockMarketAlertRules,
  mergeStockPreferenceValues,
  isStockDividendWithinCloseLimit,
  resolveStockDividendLifecycle,
  classifyStockMarketStateTradeError,
  calculateStockSeasonPeriodReturn,
  buildStockCorporateActionExecutionPlan,
  reconstructStockSeasonClosingValue,
  reconstructStockSeasonSharesAtCutoff,
  doStockDisclosureEffectsConflict,
  selectStockDisclosuresForTicker,
  selectStockShockDisclosureTargets,
  combineStockDisclosuresForTicker,
  summarizeStockDisclosureEffects,
  NOVEX_INDEX_DEFINITIONS,
  buildStockCooldownOutboxEvents,
  inspectNovex2Migration,
  calculateStockDividendEligibleShares,
  calculateForwardStockSplitPrices,
  calculateRightsOfferingPrices,
  assertStockRightsOfferingExecutionSafe,
  validateStockDisclosureEffects,
  validateStockCompanyProfileUpdate,
  nextNovexSlotAfter,
  findNovex2LegacyPriceEffectConflicts,
  parseStockMarketShadowState,
  novex2MigrationPlanFingerprint,
  novex2MigrationReadinessBlockers,
  claimNovex2MigrationReadiness,
} from "../../../dist/index.js";

test("수급은 캐릭터별 순매매를 먼저 상계하고 개인 ±100주·전체 tanh 4%를 적용한다", () => {
  const [neutral] = aggregateStockOrderFlow([
    { characterId: "a", ticker: "NVS", side: "BUY", shares: 200 },
    { characterId: "a", ticker: "NVS", side: "SELL", shares: 50 },
    { characterId: "b", ticker: "NVS", side: "SELL", shares: 300 },
  ]);
  assert.equal(neutral.netShares, 0);
  assert.equal(neutral.volume, 550);
  assert.equal(neutral.percent, 0);
  const [positive] = aggregateStockOrderFlow([
    { characterId: "a", ticker: "NVS", side: "BUY", shares: 500 },
    { characterId: "b", ticker: "NVS", side: "BUY", shares: 500 },
  ]);
  assert.equal(positive.netShares, 200);
  assert.ok(Math.abs(positive.percent - 0.04 * Math.tanh(200 / 150)) < 1e-12);
  assert.ok(positive.percent < 0.04);
});

test("23시 실패로 전날 OPEN state가 남아도 다음날 09시에는 opening pending으로 분류한다", () => {
  const stale = {
    _id: "novex",
    status: "OPEN",
    tradingDate: "2026-08-14",
    opensAt: new Date("2026-08-14T00:00:00Z"),
    closesAt: new Date("2026-08-14T14:00:00Z"),
    nextSlotAt: new Date("2026-08-14T14:00:00Z"),
    delayed: false,
    tradeRevision: 0,
    updatedAt: new Date("2026-08-14T09:00:00Z"),
  };
  assert.equal(
    classifyStockMarketStateTradeError(stale, new Date("2026-08-15T00:00:00Z")),
    "MARKET_OPENING_PENDING",
  );
  assert.equal(
    classifyStockMarketStateTradeError(stale, new Date("2026-08-14T14:00:00Z")),
    "MARKET_CLOSED",
  );
  assert.equal(
    classifyStockMarketStateTradeError(stale, new Date("2026-08-15T14:00:00Z")),
    "MARKET_CLOSED",
  );
  assert.equal(classifyStockMarketStateTradeError(null, new Date("2026-08-14T23:59:00Z")), "MARKET_CLOSED");
  assert.equal(classifyStockMarketStateTradeError(null, new Date("2026-08-15T00:00:00Z")), "MARKET_OPENING_PENDING");
  assert.equal(classifyStockMarketStateTradeError(null, new Date("2026-08-15T14:00:00Z")), "MARKET_CLOSED");
});

test("배당은 23시 확정 종가 25% 상한과 payout/ex-date 이중 완료 조건을 지킨다", () => {
  assert.equal(isStockDividendWithinCloseLimit(25, 100), true);
  assert.equal(isStockDividendWithinCloseLimit(25.01, 100), false);
  const paidFirst = resolveStockDividendLifecycle({
    pendingEntitlements: 0,
    payoutCompletedAt: new Date(1),
  });
  assert.equal(paidFirst.status, "SNAPSHOTTED");
  const exFirst = resolveStockDividendLifecycle({
    pendingEntitlements: 1,
    exDateAppliedAt: new Date(2),
  });
  assert.equal(exFirst.status, "PROCESSING");
  const completed = resolveStockDividendLifecycle({
    pendingEntitlements: 0,
    payoutCompletedAt: new Date(1),
    exDateAppliedAt: new Date(2),
  });
  assert.equal(completed.status, "COMPLETED");
  assert.deepEqual(
    calculateStockDividendEligibleShares(
      [
        { characterId: "before", shares: 10 },
        { characterId: "after-only", shares: 4 },
      ],
      [
        { characterId: "before", shares: 3 },
        { characterId: "after-only", shares: 4 },
      ],
    ),
    [{ characterId: "before", shares: 7 }],
  );
});

test("localStorage 설정 병합은 서버 alert id를 우선하고 watchlist 9·alert 50 한도를 지킨다", () => {
  const server = {
    watchlist: ["NVS"],
    alerts: [{ id: "same", kind: "DISCLOSURE", enabled: false }],
  };
  const local = {
    watchlist: ["NVS", ...Array.from({ length: 20 }, (_, index) => `T${index}`)],
    alerts: [
      { id: "same", kind: "DISCLOSURE", enabled: true },
      ...Array.from({ length: 60 }, (_, index) => ({ id: `local-${index}`, kind: "DISCLOSURE", enabled: true })),
    ],
  };
  const merged = mergeStockPreferenceValues(server, local);
  assert.equal(merged.watchlist.length, 9);
  assert.equal(merged.alerts.length, 50);
  assert.equal(merged.alerts[0].enabled, false);
  assert.equal(new Set(merged.alerts.map((row) => row.id)).size, 50);
});

function history(prevPrice, price, slotKey, disclosureIds = []) {
  return { ticker: "NVS", prevPrice, price, source: "scheduled", slotKey, disclosureIds, createdAt: new Date() };
}

test("주식 알림은 crossing 재무장, slot 1회, disclosure id 1회를 지킨다", () => {
  const initial = [
    { id: "below", ticker: "NVS", kind: "BELOW_PRICE", threshold: 90, enabled: true, armed: true },
    { id: "move", ticker: "NVS", kind: "MOVE_PERCENT", threshold: 5, enabled: true },
    { id: "news", ticker: "NVS", kind: "DISCLOSURE", enabled: true },
  ];
  const first = evaluateStockMarketAlertRules(initial, [history(100, 85, "2026-08-24 13:00", ["d1"])]);
  assert.deepEqual(first.triggers.map((row) => row.ruleId).sort(), ["below", "move", "news"]);
  const duplicate = evaluateStockMarketAlertRules(first.rules, [history(85, 84, "2026-08-24 13:00", ["d1"])]);
  assert.equal(duplicate.triggers.length, 0);
  const rearmed = evaluateStockMarketAlertRules(duplicate.rules, [history(84, 95, "2026-08-24 18:00")]);
  assert.equal(rearmed.rules.find((row) => row.id === "below").armed, true);
  const crossedAgain = evaluateStockMarketAlertRules(rearmed.rules, [history(95, 89, "2026-08-24 23:00")]);
  assert.ok(crossedAgain.triggers.some((row) => row.ruleId === "below"));
});

test("시장 공시와 개별 공시는 공존하고 같은 회차에는 개별 효과가 우선한다", () => {
  const base = {
    title: "공시",
    body: "본문",
    kind: "PRICE",
    status: "SCHEDULED",
    source: "AUTO",
    slotKey: "2026-08-24 13:00",
    createdById: "system",
    createdAt: new Date(1),
    updatedAt: new Date(1),
  };
  const market = { ...base, _id: "market", effects: [{ scope: "MARKET", changePercent: 5, structural: false }] };
  const ticker = { ...base, _id: "ticker", source: "GM", effects: [{ scope: "TICKER", ticker: "NVS", changePercent: -3, structural: false }] };
  const otherTicker = { ...base, _id: "other", effects: [{ scope: "TICKER", ticker: "OTH", changePercent: 2, structural: false }] };
  assert.equal(doStockDisclosureEffectsConflict(market.effects, ticker.effects), false);
  assert.equal(doStockDisclosureEffectsConflict(ticker.effects, otherTicker.effects), false);
  assert.deepEqual(selectStockDisclosuresForTicker([market, ticker], "NVS").map((row) => row._id), ["ticker"]);
  assert.deepEqual(selectStockDisclosuresForTicker([market, otherTicker], "NVS").map((row) => row._id), ["market"]);

  const marketShock = { ...market, shock: true };
  assert.deepEqual(
    selectStockShockDisclosureTargets(
      [marketShock, ticker],
      ["NVS", "OTH"],
    ).map((target) => `${target.disclosure._id}:${target.ticker}`),
    ["market:OTH"],
  );
});

test("병합 공시는 현재가 총효과와 구조적 적정가 효과를 분리한다", () => {
  assert.deepEqual(
    summarizeStockDisclosureEffects([
      { scope: "TICKER", ticker: "NVS", changePercent: 5, structural: true },
      { scope: "TICKER", ticker: "NVS", changePercent: -3, structural: false },
    ]),
    { changePercent: 2, structuralChangePercent: 5 },
  );
});

test("병합 회차에 GM 공시가 하나라도 있으면 합산 효과가 exact override로 유지된다", () => {
  const base = {
    title: "공시",
    body: "본문",
    kind: "PRICE",
    status: "SCHEDULED",
    effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 4, structural: false }],
    createdById: "system",
    createdAt: new Date(1),
    updatedAt: new Date(1),
  };
  const combined = combineStockDisclosuresForTicker([
    { ...base, _id: "auto", slotKey: "2026-08-24 13:00", source: "AUTO" },
    { ...base, _id: "gm", slotKey: "2026-08-24 18:00", source: "GM", effects: [{ scope: "TICKER", ticker: "NVS", changePercent: -10, structural: false }] },
  ], "NVS");
  assert.equal(combined.disclosure.source, "GM");
  assert.equal(combined.disclosure.effects[0].changePercent, -6);
  assert.deepEqual(combined.ids, ["auto", "gm"]);
});

test("유상증자 structural PRICE 공시는 같은 종목·회차 GM 공시보다 우선한다", () => {
  const base = {
    title: "공시",
    body: "본문",
    kind: "PRICE",
    status: "SCHEDULED",
    slotKey: "2026-08-24 18:00",
    effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 10, structural: true }],
    createdById: "system",
    createdAt: new Date(1),
    updatedAt: new Date(1),
  };
  const combined = combineStockDisclosuresForTicker([
    { ...base, _id: "gm", source: "GM", slotKey: "2026-08-24 23:00", effects: [{ ...base.effects[0], changePercent: -25 }] },
    { ...base, _id: "rights", source: "CORPORATE_ACTION" },
  ], "NVS");
  assert.equal(combined.disclosure.source, "CORPORATE_ACTION");
  assert.equal(combined.disclosure.effects[0].changePercent, 10);
  assert.deepEqual(combined.ids, ["rights"]);
});

test("정방향 분할은 가격과 적정가를 나누고 누적 분할계수를 곱한다", () => {
  assert.deepEqual(
    calculateForwardStockSplitPrices(
      { price: 120, referencePrice: 100, cumulativeSplitFactor: 2 },
      3,
    ),
    { price: 40, referencePrice: 33.33, cumulativeSplitFactor: 6 },
  );
  assert.equal(40 * 6, 120 * 2);
});

test("유상증자는 가격과 적정가를 나누고 별도 누적 발행계수를 곱한다", () => {
  assert.deepEqual(
    calculateRightsOfferingPrices(
      { price: 120, referencePrice: 90, cumulativeCapitalIncreaseFactor: 2 },
      3,
    ),
    { price: 40, referencePrice: 30, cumulativeCapitalIncreaseFactor: 6 },
  );
  assert.equal(40 * 6, 120 * 2);
});

test("유상증자 실행은 센트 하한·누적계수·보유주식 safe integer를 fail closed 한다", () => {
  assert.doesNotThrow(() =>
    assertStockRightsOfferingExecutionSafe({
      current: {
        price: 100,
        referencePrice: 90,
        cumulativeSplitFactor: 1,
        cumulativeCapitalIncreaseFactor: 2,
      },
      holdings: [{ shares: 10, avgPrice: 100 }],
      factor: 2,
      priceAdjustmentPercent: -35,
    }),
  );
  assert.throws(
    () =>
      assertStockRightsOfferingExecutionSafe({
        current: { price: 0.02, referencePrice: 0.02 },
        holdings: [],
        factor: 2,
        priceAdjustmentPercent: -35,
      }),
    /RIGHTS_OFFERING_PRICE_PRECISION_UNSAFE/,
  );
  assert.throws(
    () =>
      assertStockRightsOfferingExecutionSafe({
        current: {
          price: 100,
          cumulativeCapitalIncreaseFactor: Number.MAX_SAFE_INTEGER,
        },
        holdings: [],
        factor: 2,
        priceAdjustmentPercent: 0,
      }),
    /RIGHTS_OFFERING_FACTOR_UNSAFE_INTEGER/,
  );
  assert.throws(
    () =>
      assertStockRightsOfferingExecutionSafe({
        current: {
          price: 100,
          cumulativeSplitFactor: 4_000_000,
          cumulativeCapitalIncreaseFactor: 1,
        },
        holdings: [],
        factor: 2,
        priceAdjustmentPercent: 0,
      }),
    /RIGHTS_OFFERING_OUTSTANDING_SHARES_UNSAFE_INTEGER/,
  );
  assert.throws(
    () =>
      assertStockRightsOfferingExecutionSafe({
        current: { price: 100 },
        holdings: [{ shares: Number.MAX_SAFE_INTEGER, avgPrice: 100 }],
        factor: 2,
        priceAdjustmentPercent: 0,
      }),
    /RIGHTS_OFFERING_SHARES_UNSAFE_INTEGER/,
  );
});

test("동적 주요주주는 단일 종목 PRICE 공시와 100% 이하 snapshot만 허용한다", () => {
  assert.doesNotThrow(() =>
    validateStockCompanyProfileUpdate(
      {
        majorShareholders: [
          { name: "MrBeast", stakePercent: 35, note: "전략적 투자" },
          { name: "기존 주주", stakePercent: 40 },
        ],
      },
      {
        kind: "PRICE",
        effects: [
          {
            scope: "TICKER",
            ticker: "STM",
            changePercent: 70,
            structural: true,
          },
        ],
      },
    ),
  );
  assert.throws(
    () =>
      validateStockCompanyProfileUpdate(
        { majorShareholders: [{ name: "MrBeast", stakePercent: 101 }] },
        {
          kind: "PRICE",
          effects: [
            { scope: "TICKER", ticker: "STM", structural: true },
          ],
        },
      ),
    /Invalid major shareholder profile/,
  );
  assert.throws(
    () =>
      validateStockCompanyProfileUpdate(
        { majorShareholders: [{ name: "MrBeast", stakePercent: 35 }] },
        {
          kind: "INFO",
          effects: [
            { scope: "TICKER", ticker: "STM", structural: false },
          ],
        },
      ),
    /Invalid stock company profile update/,
  );
});

test("공시 가격 효과는 엔진과 같은 -50~+75% 범위만 허용한다", () => {
  assert.doesNotThrow(() =>
    validateStockDisclosureEffects([
      {
        scope: "TICKER",
        ticker: "STM",
        changePercent: 75,
        structural: true,
      },
    ]),
  );
  for (const changePercent of [-50.01, 75.01, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () =>
        validateStockDisclosureEffects([
          {
            scope: "TICKER",
            ticker: "STM",
            changePercent,
            structural: false,
          },
        ]),
      /Invalid stock disclosure effect/,
    );
  }
  assert.throws(
    () =>
      validateStockDisclosureEffects([
        {
          scope: "MARKET",
          ticker: "STM",
          changePercent: 1,
          structural: false,
        },
      ]),
    /Market disclosure effect cannot target ticker/,
  );
});

test("유상증자 merged 발표·실행은 live에서 분리하고 overdue 실행은 실제 회차에 둔다", () => {
  const scheduled = {
    _id: "rights",
    type: "RIGHTS_OFFERING",
    ticker: "NVS",
    factor: 2,
    reason: "투자",
    priceAdjustmentPercent: 15,
    announceSlotKey: "2026-08-24 13:00",
    executeSlotKey: "2026-08-24 18:00",
    status: "SCHEDULED",
  };
  assert.deepEqual(
    buildStockCorporateActionExecutionPlan(
      [scheduled],
      ["2026-08-24 13:00", "2026-08-24 18:00"],
    ).map((step) => [step.kind, step.slotKey]),
    [["RIGHTS_OFFERING_ANNOUNCE", "2026-08-24 13:00"]],
  );
  assert.deepEqual(
    buildStockCorporateActionExecutionPlan(
      [{ ...scheduled, status: "HALTED" }],
      ["2026-08-24 23:00"],
    ).map((step) => [step.kind, step.slotKey]),
    [["RIGHTS_OFFERING_EXECUTE", "2026-08-24 23:00"]],
  );
  assert.deepEqual(
    buildStockCorporateActionExecutionPlan(
      [scheduled],
      ["2026-08-24 13:00", "2026-08-24 18:00"],
      { allowCollapsedRightsOffering: true },
    ).map((step) => step.kind),
    ["RIGHTS_OFFERING_ANNOUNCE", "RIGHTS_OFFERING_EXECUTE"],
  );
});

test("시즌 Modified Dietz는 외부 매수는 보정하고 배당은 수익으로 반영한다", () => {
  assert.equal(calculateStockSeasonPeriodReturn({
    openingValue: 100,
    closingValue: 150,
    externalFlows: [{ amount: 50, weight: 0.5 }],
    returnAmount: 0,
  }), 0);
  assert.equal(calculateStockSeasonPeriodReturn({
    openingValue: 100,
    closingValue: 100,
    externalFlows: [],
    returnAmount: 10,
  }), 0.1);
  assert.equal(calculateStockSeasonPeriodReturn({
    openingValue: 100,
    closingValue: 90,
    externalFlows: [],
    returnAmount: 10,
  }), 0);
  assert.equal(
    reconstructStockSeasonClosingValue(150, [{ externalAmount: 50 }]),
    100,
  );
  assert.equal(
    reconstructStockSeasonClosingValue(80, [{ externalAmount: -20 }]),
    100,
  );
  assert.equal(
    reconstructStockSeasonSharesAtCutoff(2, [
      { kind: "GM_GRANT", shares: 2 },
    ]),
    0,
  );
  assert.equal(
    reconstructStockSeasonSharesAtCutoff(0, [
      { kind: "SELL", shares: 3 },
    ]),
    3,
  );
});

test("병합 기업행동은 slot 시간순과 배당락→분할→기준일 우선순위를 보존한다", () => {
  const plan = buildStockCorporateActionExecutionPlan(
    [
      {
        _id: "split-late",
        type: "SPLIT",
        ticker: "NVS",
        factor: 2,
        executeSlotKey: "2026-08-26 09:00",
        status: "SCHEDULED",
      },
      {
        _id: "dividend",
        type: "DIVIDEND",
        ticker: "NVS",
        amountPerShare: 1,
        recordSlotKey: "2026-08-24 23:00",
        exDateSlotKey: "2026-08-25 09:00",
        status: "SCHEDULED",
      },
      {
        _id: "split-first",
        type: "SPLIT",
        ticker: "NVS",
        factor: 2,
        executeSlotKey: "2026-08-24 09:00",
        status: "SCHEDULED",
      },
      {
        _id: "same-slot-ex-date",
        type: "DIVIDEND",
        ticker: "NVS",
        amountPerShare: 1,
        recordSlotKey: "2026-08-23 23:00",
        exDateSlotKey: "2026-08-26 09:00",
        status: "SNAPSHOTTED",
      },
    ],
    [
      "2026-08-24 09:00",
      "2026-08-24 23:00",
      "2026-08-25 09:00",
      "2026-08-26 09:00",
    ],
  );
  assert.deepEqual(
    plan.map((step) => [step.slotKey, step.kind, step.actionId]),
    [
      ["2026-08-24 09:00", "SPLIT", "split-first"],
      ["2026-08-24 23:00", "DIVIDEND_RECORD", "dividend"],
      ["2026-08-25 09:00", "DIVIDEND_EX_DATE", "dividend"],
      ["2026-08-26 09:00", "DIVIDEND_EX_DATE", "same-slot-ex-date"],
      ["2026-08-26 09:00", "SPLIT", "split-late"],
    ],
  );
});

test("NOVEX 신규 컬렉션 인덱스 계약은 멱등키·due scan·시즌 rank를 포함한다", () => {
  const names = Object.values(NOVEX_INDEX_DEFINITIONS).flat().map((index) => index.name);
  for (const required of [
    "stock_order_flow_operationKey_unique",
    "stock_disclosures_status_slot_source",
    "stock_market_preferences_user_unique",
    "stock_dividend_entitlements_action_character_unique",
    "stock_investment_seasons_single_active_unique",
    "stock_season_performance_rank",
    "stock_season_flows_operationKey_unique",
  ]) assert.ok(names.includes(required), required);
});

test("migration preflight는 같은 이름의 잘못된 key와 임의 이름 TTL을 탐지한다", async () => {
  const db = {
    collection(name) {
      return {
        async indexes() {
          if (name === "stock_price_history") {
            return [
              { name: "_id_", key: { _id: 1 } },
              {
                name: "stock_price_history_createdAt",
                key: { createdAt: -1 },
              },
              {
                name: "legacy_ttl_with_unexpected_name",
                key: { createdAt: 1 },
                expireAfterSeconds: 30,
              },
            ];
          }
          if (name === "stock_disclosures") {
            return [
              {
                name: "stock_disclosures_status_publishAt",
                key: { publishAt: 1, status: 1 },
              },
            ];
          }
          return [];
        },
        async countDocuments() {
          return 0;
        },
        find() {
          const cursor = {
            sort() {
              return cursor;
            },
            async toArray() {
              return [];
            },
          };
          return cursor;
        },
        aggregate() {
          return {
            async next() {
              return name === "stock_market_preferences"
                ? { count: 2 }
                : null;
            },
          };
        },
      };
    },
  };
  const plan = await inspectNovex2Migration(db);
  assert.deepEqual(plan.ttlIndexNames, ["legacy_ttl_with_unexpected_name"]);
  assert.equal(plan.ttlIndexSpecs[0].actual.expireAfterSeconds, 30);
  const history = plan.indexSpecs.find(
    (spec) => spec.name === "stock_price_history_createdAt",
  );
  assert.equal(history.action, "RECREATE");
  assert.deepEqual(history.expected.key, [["createdAt", 1]]);
  assert.deepEqual(history.actual.key, [["createdAt", -1]]);
  const reversedCompound = plan.indexSpecs.find(
    (spec) => spec.name === "stock_disclosures_status_publishAt",
  );
  assert.equal(reversedCompound.action, "RECREATE");
  assert.deepEqual(reversedCompound.expected.key, [
    ["status", 1],
    ["publishAt", 1],
  ]);
  assert.deepEqual(reversedCompound.actual.key, [
    ["publishAt", 1],
    ["status", 1],
  ]);
  assert.equal(
    plan.uniqueIndexChecks.find(
      (check) => check.name === "stock_market_preferences_user_unique",
    ).duplicateGroups,
    2,
  );
  assert.notEqual(
    novex2MigrationPlanFingerprint(plan),
    novex2MigrationPlanFingerprint({
      ...plan,
      ttlIndexSpecs: plan.ttlIndexSpecs.map((spec) => ({
        ...spec,
        actual: { ...spec.actual, expireAfterSeconds: 60 },
      })),
    }),
  );
  assert.notEqual(
    novex2MigrationPlanFingerprint(plan),
    novex2MigrationPlanFingerprint({
      ...plan,
      legacyPendingEvents: 1,
      legacyPendingEventsToConvert: 1,
      legacyPendingEventSpecs: [{ id: "new-event", contentHash: "hash", ticker: "NVS", targetSlotKey: "2026-08-24 13:00" }],
    }),
  );
  assert.notEqual(
    novex2MigrationPlanFingerprint(plan),
    novex2MigrationPlanFingerprint({
      ...plan,
      pricesWithoutReferencePrice: 1,
      referencePriceBackfillSpecs: [{ ticker: "NVS", price: 10 }],
    }),
  );
});

test("migration의 다음 NOVEX 슬롯은 입력 시각보다 항상 미래다", () => {
  assert.equal(
    nextNovexSlotAfter(
      new Date("2026-08-24T13:00:30+09:00"),
    ).toISOString(),
    "2026-08-24T09:00:00.000Z",
  );
  assert.equal(
    nextNovexSlotAfter(
      new Date("2026-08-24T23:00:00+09:00"),
    ).toISOString(),
    "2026-08-25T00:00:00.000Z",
  );
});

test("NOVEX migration READY marker는 모든 전환 blocker가 사라진 계획에서만 허용한다", () => {
  const ready = {
    ttlIndexPresent: false,
    ttlIndexNames: [],
    ttlIndexSpecs: [],
    pricesWithoutReferencePrice: 0,
    referencePriceBackfillSpecs: [],
    indexesToCreate: [],
    indexSpecs: [],
    uniqueIndexChecks: [],
    legacyPendingEventSpecs: [],
    legacyPendingPriceEffectConflicts: [],
    legacyPendingEvents: 0,
    legacyPendingEventsAlreadyConverted: 0,
    legacyPendingEventsToConvert: 0,
  };
  assert.deepEqual(novex2MigrationReadinessBlockers(ready), []);
  assert.match(
    novex2MigrationReadinessBlockers({
      ...ready,
      pricesWithoutReferencePrice: 1,
    }).join(" "),
    /referencePrice/,
  );
  assert.match(
    novex2MigrationReadinessBlockers({
      ...ready,
      uniqueIndexChecks: [
        { collection: "stock_prices", name: "ticker", duplicateGroups: 1 },
      ],
    }).join(" "),
    /unique duplicates/,
  );
});

test("NOVEX migration READY marker claim은 APPLYING owner를 CAS로 덮어쓰지 않는다", async () => {
  let observedFilter;
  const db = {
    collection() {
      return {
        async updateOne(filter) {
          observedFilter = filter;
          return { matchedCount: 0, upsertedCount: 1 };
        },
      };
    },
  };
  const now = new Date("2026-08-17T00:00:00.000Z");
  const claimed = await claimNovex2MigrationReadiness(db, {
    sourcePlanFingerprint: "plan",
    attemptId: "attempt-a",
    now,
  });
  assert.deepEqual(observedFilter, {
    _id: "novex-2",
    status: { $in: ["PRE_MIGRATION", "BLOCKED"] },
  });
  assert.deepEqual(claimed, { attemptId: "attempt-a", startedAt: now });

  const contested = {
    collection() {
      return {
        async findOne() {
          return { _id: "novex-2", status: "APPLYING" };
        },
        async updateOne() {
          throw Object.assign(new Error("duplicate"), { code: 11000 });
        },
      };
    },
  };
  await assert.rejects(
    claimNovex2MigrationReadiness(contested, {
      sourcePlanFingerprint: "plan",
      attemptId: "attempt-b",
      now,
    }),
    /NOVEX_MIGRATION_ALREADY_APPLYING/,
  );
});

test("migration은 같은 종목·회차 legacy 중복과 기존 가격 공시를 모두 blocker로 만든다", () => {
  const targets = ["legacy-a", "legacy-b"].map((id) => ({
    id,
    contentHash: `${id}-hash`,
    ticker: "NVS",
    targetSlotKey: "2026-08-24 13:00",
  }));
  assert.deepEqual(
    findNovex2LegacyPriceEffectConflicts(targets, [{
      _id: "existing",
      slotKey: "2026-08-24 13:00",
      effects: [{ scope: "TICKER", ticker: "NVS", changePercent: 2, structural: false }],
    }]),
    [{
      ticker: "NVS",
      targetSlotKey: "2026-08-24 13:00",
      legacyEventIds: ["legacy-a", "legacy-b"],
      existingDisclosureIds: ["existing"],
    }],
  );
});

test("shadow 누적 상태는 완전한 가격·수급 계약만 복원한다", () => {
  const state = {
    version: 1,
    lastCompletedSlotKey: "2026-08-24 13:00",
    completedAt: "2026-08-24T04:00:00.000Z",
    prices: [{
      ticker: "NVS",
      price: 100,
      prevPrice: 99,
      eventText: "정기 변동",
      lastUpdate: "2026-08-24 13:00",
      referencePrice: 100,
      pendingBasePercent: 0,
      cumulativeSplitFactor: 1,
      cumulativeCapitalIncreaseFactor: 1,
    }],
    rejectedDividendActionIds: [],
    pendingFlows: [{ operationKey: "flow-1", characterId: "c1", ticker: "NVS", side: "BUY", shares: 2 }],
    seenFlowOperationKeys: ["flow-1"],
  };
  assert.deepEqual(parseStockMarketShadowState(JSON.stringify(state)), state);
  assert.equal(
    parseStockMarketShadowState(JSON.stringify({ ...state, prices: [{ ...state.prices[0], price: -1 }] })),
    null,
  );
});

test("같은 회차의 냉각 종목은 시작 1건과 해제 1건으로 묶어 예약한다", () => {
  const startedAt = new Date("2026-08-15T04:00:00Z");
  const cooldownUntil = new Date("2026-08-15T04:10:00Z");
  const events = buildStockCooldownOutboxEvents({
    slotKey: "2026-08-15 13:00",
    startedAt,
    items: [
      {
        ticker: "TWS",
        previousPrice: 100,
        price: 112,
        reason: "VOLATILITY_15_PERCENT",
        cooldownUntil,
      },
      {
        ticker: "STM",
        previousPrice: 50,
        price: 40,
        reason: "GM_FORCE_COOLDOWN",
        cooldownUntil,
      },
      {
        ticker: "SPZ",
        previousPrice: 1_000,
        price: 800,
        reason: "VOLATILITY_15_PERCENT",
        cooldownUntil,
      },
    ],
  });
  assert.equal(events.length, 2);
  const [start, release] = events;
  assert.equal(start.partitionKey, release.partitionKey);
  assert.equal(start.partitionKey, "stock:round:2026-08-15 13:00");
  assert.equal(start.partitionOrderAt, startedAt);
  assert.equal(release.partitionOrderAt.getTime(), cooldownUntil.getTime());
  assert.equal(release.availableAt.getTime(), cooldownUntil.getTime());
  assert.equal(start.dedupeKey, "stock:cooldown:2026-08-15 13:00:batch");
  assert.equal(release.dedupeKey, "stock:cooldown-release:2026-08-15 13:00:batch");
  assert.deepEqual(
    start.payload.items.map((item) => item.ticker),
    ["TWS", "STM", "SPZ"],
  );
  assert.equal(release.payload.items.length, 3);
  assert.equal(release.payload.eventKind, "COOLDOWN_RELEASE");
});

test("냉각 묶음 outbox는 빈 목록과 중복 종목을 거부한다", () => {
  const base = {
    slotKey: "2026-08-15 13:00",
    startedAt: new Date("2026-08-15T04:00:00Z"),
  };
  assert.throws(
    () => buildStockCooldownOutboxEvents({ ...base, items: [] }),
    /at least one ticker/,
  );
  const duplicate = {
    ticker: "TWS",
    previousPrice: 100,
    price: 112,
    reason: "VOLATILITY_15_PERCENT",
    cooldownUntil: new Date("2026-08-15T04:10:00Z"),
  };
  assert.throws(
    () => buildStockCooldownOutboxEvents({
      ...base,
      items: [duplicate, { ...duplicate }],
    }),
    /duplicate tickers/,
  );
});
