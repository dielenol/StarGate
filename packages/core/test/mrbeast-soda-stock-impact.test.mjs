import assert from "node:assert/strict";
import test from "node:test";

import {
  MRBEAST_SODA_STOCK_IMPACT_DURATION_MS,
  calculateMrBeastSodaStockImpactPercent,
  isMrBeastSodaStockImpactPurchaseEligible,
  isMrBeastSodaStockImpactTickEnabled,
  resolveMrBeastSodaStockImpactWindow,
} from "../dist/domain/mrbeast-soda-stock-impact.js";

test("미스터비스트 소다 STM 영향 기간은 이벤트 시작부터 최대 14일이다", () => {
  const startAt = new Date("2026-07-31T03:00:00.000Z");
  const window = resolveMrBeastSodaStockImpactWindow({
    eventId: "mrbeast-2026",
    configVersion: 1,
    startAt,
    endAt: new Date("2026-08-31T03:00:00.000Z"),
  });

  assert.ok(window);
  assert.equal(
    window.endAt.getTime() - window.startAt.getTime(),
    MRBEAST_SODA_STOCK_IMPACT_DURATION_MS,
  );
  assert.equal(
    isMrBeastSodaStockImpactPurchaseEligible(window, startAt),
    true,
  );
  assert.equal(
    isMrBeastSodaStockImpactPurchaseEligible(window, window.endAt),
    false,
  );
});

test("판매 1개당 0.10%p를 가산하고 하루 5%p에서 제한한다", () => {
  assert.equal(calculateMrBeastSodaStockImpactPercent(0), 0);
  assert.equal(calculateMrBeastSodaStockImpactPercent(1), 0.001);
  assert.equal(calculateMrBeastSodaStockImpactPercent(36), 0.036);
  assert.equal(calculateMrBeastSodaStockImpactPercent(50), 0.05);
  assert.equal(calculateMrBeastSodaStockImpactPercent(500), 0.05);
});

test("STM 자동 소비 gate는 명시적인 true 또는 1에서만 열린다", () => {
  assert.equal(isMrBeastSodaStockImpactTickEnabled(undefined), false);
  assert.equal(isMrBeastSodaStockImpactTickEnabled("false"), false);
  assert.equal(isMrBeastSodaStockImpactTickEnabled("on"), false);
  assert.equal(isMrBeastSodaStockImpactTickEnabled("true"), true);
  assert.equal(isMrBeastSodaStockImpactTickEnabled(" TRUE "), true);
  assert.equal(isMrBeastSodaStockImpactTickEnabled("1"), true);
});
