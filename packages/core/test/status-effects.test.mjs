import assert from "node:assert/strict";
import test from "node:test";

import {
  ACID_CORROSION_STAT_LABELS,
  ACID_STATUS_EFFECT_RULE,
  resolveAcidCorrosionThreshold,
} from "../dist/domain/status-effects.js";

test("산성은 공격력 또는 방어력에 N의 누적 부식을 적용한다", () => {
  assert.equal(ACID_STATUS_EFFECT_RULE.intrinsicDamage, false);
  assert.deepEqual(ACID_STATUS_EFFECT_RULE.corrosion.targetStatChoices, [
    "attack",
    "defense",
  ]);
  assert.equal(ACID_STATUS_EFFECT_RULE.corrosion.valueSource, "N");
  assert.equal(ACID_STATUS_EFFECT_RULE.corrosion.stacking, "accumulate-loss");
  assert.deepEqual(ACID_CORROSION_STAT_LABELS, {
    attack: "공격력",
    defense: "방어력",
  });
});

test("산성 누적 손실이 기준 최대치의 절반에 도달하면 피해 후 초기화한다", () => {
  assert.equal(ACID_STATUS_EFFECT_RULE.threshold.ratio, 0.5);
  assert.equal(
    ACID_STATUS_EFFECT_RULE.threshold.basis,
    "source-maximum-unspecified",
  );
  assert.equal(ACID_STATUS_EFFECT_RULE.threshold.requiresGmClarification, true);
  assert.equal(ACID_STATUS_EFFECT_RULE.thresholdEffect.ignoresDefense, true);

  assert.deepEqual(resolveAcidCorrosionThreshold(4, 10), {
    triggered: false,
    hpDamage: 0,
    remainingCorrosionLoss: 4,
  });
  assert.deepEqual(resolveAcidCorrosionThreshold(5, 10), {
    triggered: true,
    hpDamage: 5,
    remainingCorrosionLoss: 0,
  });
  assert.deepEqual(resolveAcidCorrosionThreshold(6, 10), {
    triggered: true,
    hpDamage: 6,
    remainingCorrosionLoss: 0,
  });
});

test("산성 판정은 유효하지 않은 수치를 거부한다", () => {
  assert.throws(() => resolveAcidCorrosionThreshold(-1, 10), RangeError);
  assert.throws(() => resolveAcidCorrosionThreshold(1, 0), RangeError);
});
