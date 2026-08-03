/**
 * 노부스 오르도 공용 상태이상 규칙.
 *
 * GM이 제공한 확정 규칙만 런타임 중립 데이터로 보관한다.
 */

export const STATUS_EFFECT_RULE_SOURCE = {
  classification: "canon-from-source",
  providedBy: "GM",
  recordedAt: "2026-08-03",
} as const;

export const ACID_CORROSION_STATS = ["attack", "defense"] as const;

export type AcidCorrosionStat = (typeof ACID_CORROSION_STATS)[number];

export const ACID_CORROSION_STAT_LABELS = {
  attack: "공격력",
  defense: "방어력",
} as const satisfies Record<AcidCorrosionStat, string>;

export const ACID_STATUS_EFFECT_RULE = {
  id: "acid",
  label: "산성",
  category: "physical",
  description:
    "장비나 물건을 부식시키는 여러 종류의 부식성 피해입니다.",
  intrinsicDamage: false,
  corrosion: {
    valueSource: "N",
    targetStatChoices: ACID_CORROSION_STATS,
    targetStatLabels: ACID_CORROSION_STAT_LABELS,
    effect: "reduce-target-stat",
    stacking: "accumulate-loss",
  },
  threshold: {
    basis: "source-maximum-unspecified",
    ratio: 0.5,
    comparison: "at-or-above",
    requiresGmClarification: true,
  },
  thresholdEffect: {
    damageTarget: "hp",
    damageAmount: "accumulated-corrosion-loss",
    ignoresDefense: true,
    afterDamage: "reset-corrosion-loss",
  },
} as const;

export interface AcidCorrosionThresholdResult {
  triggered: boolean;
  hpDamage: number;
  remainingCorrosionLoss: number;
}

/** 산성 부식 누적치가 호출자가 제공한 기준 최대치의 절반에 도달했는지 판정한다. */
export function resolveAcidCorrosionThreshold(
  accumulatedLoss: number,
  referencedMaximum: number,
): AcidCorrosionThresholdResult {
  if (!Number.isFinite(accumulatedLoss) || accumulatedLoss < 0) {
    throw new RangeError("산성 부식 누적 손실은 0 이상의 유한수여야 합니다.");
  }
  if (!Number.isFinite(referencedMaximum) || referencedMaximum <= 0) {
    throw new RangeError("산성 부식 기준 최대치는 0보다 큰 유한수여야 합니다.");
  }

  const triggered =
    accumulatedLoss >=
    referencedMaximum * ACID_STATUS_EFFECT_RULE.threshold.ratio;

  return triggered
    ? {
        triggered: true,
        hpDamage: accumulatedLoss,
        remainingCorrosionLoss: 0,
      }
    : {
        triggered: false,
        hpDamage: 0,
        remainingCorrosionLoss: accumulatedLoss,
      };
}
