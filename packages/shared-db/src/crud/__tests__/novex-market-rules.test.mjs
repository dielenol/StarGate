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
  summarizeStockDisclosureEffects,
  NOVEX_INDEX_DEFINITIONS,
  buildStockCooldownOutboxEvents,
  inspectNovex2Migration,
  calculateStockDividendEligibleShares,
  nextNovexSlotAfter,
  novex2MigrationPlanFingerprint,
} from "../../../dist/index.js";

test("수급은 캐릭터별 순매매를 먼저 상계하고 개인 ±100주·전체 tanh 3%를 적용한다", () => {
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
  assert.ok(Math.abs(positive.percent - 0.03 * Math.tanh(1)) < 1e-12);
  assert.ok(positive.percent < 0.03);
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
      legacyPendingEventSpecs: [{ id: "new-event", contentHash: "hash" }],
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

test("냉각 시작과 해제 outbox는 같은 partition에서 10분 순서를 미리 예약한다", () => {
  const startedAt = new Date("2026-08-15T04:00:00Z");
  const cooldownUntil = new Date("2026-08-15T04:10:00Z");
  const [start, release] = buildStockCooldownOutboxEvents({
    ticker: "NVS",
    slotKey: "2026-08-15 13:00",
    previousPrice: 100,
    price: 112,
    reason: "VOLATILITY_12_PERCENT",
    startedAt,
    cooldownUntil,
  });
  assert.equal(start.partitionKey, release.partitionKey);
  assert.equal(start.partitionOrderAt, startedAt);
  assert.equal(release.partitionOrderAt, cooldownUntil);
  assert.equal(release.availableAt, cooldownUntil);
  assert.equal(release.payload.eventKind, "COOLDOWN_RELEASE");
});
