import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildScenarioTimeline } from "../scenario-timeline.ts";

const NOW = new Date("2026-08-19T00:00:00.000Z");

function disclosure(overrides) {
  return {
    id: "d1",
    status: "SCHEDULED",
    scope: "TICKERS",
    tickers: ["STM"],
    publishAt: "2026-08-19T04:00:00.000Z",
    headline: "공시",
    canEdit: true,
    canCancel: true,
    ...overrides,
  };
}

function action(overrides) {
  return {
    id: "a1",
    type: "SPLIT",
    status: "SCHEDULED",
    ticker: "STM",
    executeAt: "2026-08-19T09:00:00.000Z",
    ...overrides,
  };
}

test("종목별 공시와 기업행동을 시각 순으로 합쳐 가격 경로를 만든다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({
        id: "up",
        publishAt: "2026-08-19T04:00:00.000Z",
        headline: "호재",
        effects: [{ scope: "TICKER", ticker: "STM", changePercent: 10, structural: false }],
      }),
    ],
    corporateActions: [
      action({ id: "split", type: "SPLIT", ratio: 2, executeAt: "2026-08-19T09:00:00.000Z" }),
    ],
  });

  assert.deepEqual(
    timeline.events.map((event) => [event.id, event.projectedPrice]),
    [
      ["up", 110],
      ["split", 55],
    ],
  );
  assert.equal(timeline.finalPrice, 55);
  assert.equal(Number(timeline.totalChangePercent.toFixed(2)), -45);
});

test("이미 지난 예약과 다른 종목 예약은 흐름에서 제외한다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({ id: "past", publishAt: "2026-08-18T04:00:00.000Z" }),
      disclosure({ id: "other", tickers: ["ART"] }),
    ],
    corporateActions: [action({ id: "otherTicker", ticker: "ART" })],
  });

  assert.deepEqual(timeline.events, []);
  assert.equal(timeline.finalPrice, 100);
});

test("취소·공개 완료 공시와 종료된 기업행동은 예약 흐름에 넣지 않는다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({ id: "cancelled", status: "CANCELLED" }),
      disclosure({ id: "published", status: "PUBLISHED" }),
    ],
    corporateActions: [
      action({ id: "done", status: "COMPLETED" }),
      action({ id: "cancelled", status: "CANCELLED" }),
    ],
  });

  assert.deepEqual(timeline.events, []);
});

test("시장 전체 공시는 개별 종목 효과가 없을 때만 적용하고 표시를 구분한다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({
        id: "market",
        scope: "MARKET",
        tickers: [],
        effects: [{ scope: "MARKET", changePercent: -5, structural: false }],
      }),
    ],
    corporateActions: [],
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].marketWide, true);
  assert.equal(timeline.events[0].projectedPrice, 95);
});

test("같은 공시에 종목 효과와 시장 효과가 함께 있으면 종목 효과를 쓴다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({
        id: "both",
        scope: "MARKET",
        tickers: ["STM"],
        effects: [
          { scope: "MARKET", changePercent: -5, structural: false },
          { scope: "TICKER", ticker: "STM", changePercent: 20, structural: false },
        ],
      }),
    ],
    corporateActions: [],
  });

  assert.equal(timeline.events[0].marketWide, false);
  assert.equal(timeline.events[0].projectedPrice, 120);
});

test("유상증자는 실행 시각에 조정률로, 배당은 배당락으로 반영한다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [],
    corporateActions: [
      action({
        id: "rights",
        type: "RIGHTS_OFFERING",
        priceAdjustmentPercent: -32.4,
        executeAt: "2026-08-19T04:00:00.000Z",
      }),
      action({
        id: "dividend",
        type: "DIVIDEND",
        perShare: 6.6,
        executeAt: "2026-08-19T09:00:00.000Z",
      }),
    ],
  });

  assert.deepEqual(
    timeline.events.map((event) => [event.id, event.projectedPrice]),
    [
      ["rights", 67.6],
      ["dividend", 61],
    ],
  );
});

test("같은 회차에서는 기업행동을 먼저 반영한 뒤 공시를 적용한다", () => {
  const at = "2026-08-19T04:00:00.000Z";
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [
      disclosure({
        id: "news",
        publishAt: at,
        effects: [{ scope: "TICKER", ticker: "STM", changePercent: 10, structural: false }],
      }),
    ],
    corporateActions: [action({ id: "split", type: "SPLIT", ratio: 2, executeAt: at })],
  });

  assert.deepEqual(
    timeline.events.map((event) => [event.id, event.projectedPrice]),
    [
      ["split", 50],
      ["news", 55],
    ],
  );
});

test("효과가 없는 정보 전용 공시도 흐름에 남기되 가격은 바꾸지 않는다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 100,
    now: NOW,
    disclosures: [disclosure({ id: "info", kind: "INFO" })],
    corporateActions: [],
  });

  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].changePercent, undefined);
  assert.equal(timeline.events[0].projectedPrice, 100);
});

test("가격은 최소 단가 아래로 내려가지 않는다", () => {
  const timeline = buildScenarioTimeline({
    ticker: "STM",
    currentPrice: 0.05,
    now: NOW,
    disclosures: [],
    corporateActions: [action({ id: "dividend", type: "DIVIDEND", perShare: 10 })],
  });

  assert.equal(timeline.finalPrice, 0.01);
});
