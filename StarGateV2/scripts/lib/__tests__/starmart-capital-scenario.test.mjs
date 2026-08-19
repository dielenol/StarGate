import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStarmartCapitalScenarioPlan,
  firstNovexSlotAfter,
  starmartCapitalScenarioFingerprint,
} from "../starmart-capital-scenario.ts";
import {
  enabledRunsAreConsecutive,
  executionFingerprint,
  existingScenarioStateIsHealthy,
  inspectionBlockers,
} from "../../schedule-starmart-capital-scenario.ts";

function readyInspection() {
  const now = new Date("2026-08-18T00:10:00.000Z");
  const run = (slotKey, completedAt) => ({
    jobName: "stocks.tick",
    slotKey,
    status: "SUCCEEDED",
    attempts: 1,
    availableAt: completedAt,
    summary: { novexMode: "enabled" },
    startedAt: completedAt,
    updatedAt: completedAt,
    completedAt,
  });
  return {
    now,
    inspection: {
      migrationReadiness: {
        _id: "novex-2",
        version: 2,
        status: "READY",
        attemptId: "attempt-1",
        sourcePlanFingerprint: "before",
        readyPlanFingerprint: "ready",
        startedAt: new Date("2026-08-17T00:00:00.000Z"),
        completedAt: new Date("2026-08-17T00:01:00.000Z"),
        updatedAt: new Date("2026-08-17T00:01:00.000Z"),
      },
      marketState: {
        _id: "novex",
        status: "OPENING_PENDING",
        tradingDate: "2026-08-18",
        opensAt: new Date("2026-08-18T00:00:00.000Z"),
        closesAt: new Date("2026-08-18T14:00:00.000Z"),
        lastCompletedSlotKey: "2026-08-17 23:00",
        delayed: false,
        tradeRevision: 4,
        updatedAt: new Date("2026-08-17T14:01:00.000Z"),
      },
      recentEnabledRuns: [
        run("2026-08-17 23:00", new Date("2026-08-17T14:01:00.000Z")),
        run("2026-08-17 18:00", new Date("2026-08-17T09:01:00.000Z")),
        run("2026-08-17 13:00", new Date("2026-08-17T04:01:00.000Z")),
        run("2026-08-17 09:00", new Date("2026-08-17T00:01:00.000Z")),
      ],
      price: {
        ticker: "STM",
        price: 2.95,
        prevPrice: 2.95,
        referencePrice: 2.95,
        eventText: "",
        lastUpdate: "2026-08-17 23:00",
      },
      companyProfile: null,
      holdings: [{ shares: 100, avgPrice: 3 }],
      totalHoldingShares: 100,
      deferredSlotKeys: [],
      activeActionCount: 0,
      conflictingDisclosureCount: 0,
      existingAction: null,
      existingDisclosures: [],
    },
  };
}

function scheduledScenarioInspection(plan) {
  const base = readyInspection().inspection;
  const now = new Date("2026-08-17T02:00:00.000Z");
  const custom = plan.disclosures.map((item) => ({
    _id: item.id,
    title: item.title,
    body: item.body,
    kind: "PRICE",
    status: "SCHEDULED",
    source: "GM",
    effects: item.effects,
    slotKey: item.slotKey,
    publishAt: new Date(`${item.slotKey.replace(" ", "T")}:00+09:00`),
    ownerCorporateActionId: plan.action.id,
    companyProfileUpdate: item.companyProfileUpdate,
    createdById: "system:stm-mrbeast-v1",
    createdAt: now,
    updatedAt: now,
  }));
  return {
    ...base,
    price: {
      ...base.price,
      corporateActionReservationId: plan.action.id,
    },
    existingAction: {
      _id: plan.action.id,
      type: "RIGHTS_OFFERING",
      ticker: plan.ticker,
      factor: plan.action.factor,
      reason: plan.action.reason,
      priceAdjustmentPercent: plan.action.priceAdjustmentPercent,
      announceSlotKey: plan.action.announceSlotKey,
      executeSlotKey: plan.action.executeSlotKey,
      status: "SCHEDULED",
      createdById: "system:stm-mrbeast-v1",
      createdAt: now,
      updatedAt: now,
    },
    existingDisclosures: [
      {
        _id: `stock-disclosure:corporate-action:${plan.action.id}:announcement`,
        title: "managed announcement",
        body: "managed",
        kind: "INFO",
        status: "SCHEDULED",
        source: "CORPORATE_ACTION",
        effects: [],
        createdById: "system:stm-mrbeast-v1",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `stock-disclosure:corporate-action:${plan.action.id}:execution`,
        title: "managed execution",
        body: "managed",
        kind: "PRICE",
        status: "SCHEDULED",
        source: "CORPORATE_ACTION",
        effects: [],
        createdById: "system:stm-mrbeast-v1",
        createdAt: now,
        updatedAt: now,
      },
      ...custom,
    ],
  };
}

test("스타마트 시나리오는 유증 발표부터 후속 호재 3회까지 연속 NOVEX 회차를 만든다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
  });

  assert.deepEqual(plan.slotKeys, [
    "2026-08-17 13:00",
    "2026-08-17 18:00",
    "2026-08-17 23:00",
    "2026-08-18 09:00",
    "2026-08-18 13:00",
    "2026-08-18 18:00",
  ]);
  assert.equal(plan.action.factor, 2);
  assert.equal(plan.action.priceAdjustmentPercent, -32.4);
  assert.equal(plan.disclosures[0].effects[0].changePercent, 63.8);
  assert.deepEqual(
    plan.disclosures.slice(1).map((item) => item.effects[0].changePercent),
    [38.6, 27.4, 44.1],
  );
  assert.deepEqual(plan.majorShareholders, [
    {
      name: "미스터비스트",
      stakePercent: 17.3,
      note: "전략적 지분 투자",
    },
  ]);
});

test("후속 호재 변동률은 회차별로 다르게 지정할 수 있다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
    followupPriceChangePercents: [29.3, 41.7, 33.8],
  });

  assert.deepEqual(
    plan.disclosures.slice(1).map((item) => item.effects[0].changePercent),
    [29.3, 41.7, 33.8],
  );
});

test("후속 호재 변동률 개수가 후속 공시 횟수와 다르면 거절한다", () => {
  assert.throws(
    () =>
      buildStarmartCapitalScenarioPlan({
        announceSlotKey: "2026-08-17 13:00",
        followupCount: 3,
        followupPriceChangePercents: [29.3, 41.7],
      }),
    /후속 호재 변동률은 후속 공시 횟수와 같은 3개여야 합니다/,
  );
});

test("단일 후속 변동률을 주면 전 회차에 같은 값을 적용한다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
    followupCount: 2,
    followupPriceChangePercent: 26.5,
  });

  assert.deepEqual(
    plan.disclosures.slice(1).map((item) => item.effects[0].changePercent),
    [26.5, 26.5],
  );
});

test("기존 주요 주주는 보존하고 미스터비스트 항목만 최신 지분으로 치환한다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
    mrBeastStakePercent: 18.5,
    existingMajorShareholders: [
      { name: "창업자", stakePercent: 30 },
      { name: "미스터비스트", stakePercent: 5, note: "과거 값" },
    ],
  });

  assert.deepEqual(plan.majorShareholders, [
    { name: "창업자", stakePercent: 30 },
    {
      name: "미스터비스트",
      stakePercent: 18.5,
      note: "전략적 지분 투자",
    },
  ]);
});

test("동일 계획은 같은 fingerprint를 만들고 경제 입력이 바뀌면 달라진다", () => {
  const base = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
  });
  const same = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
  });
  const changed = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-17 13:00",
    followupPriceChangePercent: 20,
  });

  assert.equal(
    starmartCapitalScenarioFingerprint(base),
    starmartCapitalScenarioFingerprint(same),
  );
  assert.notEqual(
    starmartCapitalScenarioFingerprint(base),
    starmartCapitalScenarioFingerprint(changed),
  );
});

test("최소 30분 여유를 만족하는 첫 미래 회차를 고른다", () => {
  assert.equal(
    firstNovexSlotAfter(new Date("2026-08-17T02:00:00.000Z"), 30),
    "2026-08-17 13:00",
  );
  assert.equal(
    firstNovexSlotAfter(new Date("2026-08-17T03:30:00.000Z"), 30),
    "2026-08-17 18:00",
  );
});

test("후속 횟수와 지분 합계 경계를 검증한다", () => {
  assert.throws(
    () =>
      buildStarmartCapitalScenarioPlan({
        announceSlotKey: "2026-08-17 13:00",
        followupCount: 1,
      }),
    /2~3회/,
  );
  assert.throws(
    () =>
      buildStarmartCapitalScenarioPlan({
        announceSlotKey: "2026-08-17 13:00",
        mrBeastStakePercent: 40,
        existingMajorShareholders: [{ name: "창업자", stakePercent: 70 }],
      }),
    /100%를 초과/,
  );
});

test("동일 예약 no-op은 SCHEDULED owner와 공시 상태가 모두 정상일 때만 허용한다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-18 13:00",
  });
  const healthy = scheduledScenarioInspection(plan);
  assert.equal(existingScenarioStateIsHealthy(healthy, plan), true);
  assert.equal(
    existingScenarioStateIsHealthy(
      { ...healthy, price: { ...healthy.price, corporateActionReservationId: undefined } },
      plan,
    ),
    false,
  );
  assert.equal(
    existingScenarioStateIsHealthy(
      {
        ...healthy,
        existingDisclosures: healthy.existingDisclosures.map((item, index) =>
          index === 0 ? { ...item, status: "CANCELLED" } : item,
        ),
      },
      plan,
    ),
    false,
  );
});

test("worker 증거는 최근 4회가 실제 NOVEX 순서로 연속이어야 한다", () => {
  const { inspection } = readyInspection();
  assert.equal(enabledRunsAreConsecutive(inspection.recentEnabledRuns), true);
  assert.equal(
    enabledRunsAreConsecutive([
      inspection.recentEnabledRuns[0],
      inspection.recentEnabledRuns[2],
      inspection.recentEnabledRuns[3],
    ]),
    false,
  );
});

test("예약 preflight는 조기폐장 이월과 개별 평단 정밀도 위험을 막는다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-18 13:00",
  });
  const { inspection, now } = readyInspection();
  assert.deepEqual(inspectionBlockers(inspection, plan, now), []);
  assert.match(
    inspectionBlockers(
      { ...inspection, deferredSlotKeys: [plan.slotKeys[1]] },
      plan,
      now,
    ).join(" "),
    /조기폐장/,
  );
  assert.match(
    inspectionBlockers(
      { ...inspection, holdings: [{ shares: 100, avgPrice: 0.01 }] },
      plan,
      now,
    ).join(" "),
    /AVG_PRICE_PRECISION_UNSAFE/,
  );
});

test("승인 fingerprint는 개별 보유 상태가 바뀌면 달라진다", () => {
  const plan = buildStarmartCapitalScenarioPlan({
    announceSlotKey: "2026-08-18 13:00",
  });
  const { inspection } = readyInspection();
  const fingerprint = (value) =>
    executionFingerprint({
      migrationFingerprint: "migration",
      scenarioFingerprint: starmartCapitalScenarioFingerprint(plan),
      inspection: value,
    });
  assert.notEqual(
    fingerprint(inspection),
    fingerprint({ ...inspection, holdings: [{ shares: 99, avgPrice: 3 }] }),
  );
});
