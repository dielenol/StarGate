/**
 * 노부스 오르도 전투 근간 규칙.
 *
 * GM이 제공한 확정 규칙만 런타임 중립 데이터로 보관한다. 이동 거리, 충돌,
 * 강제 이동 우선순위처럼 아직 제공되지 않은 판정은 소비자가 추론하지 않는다.
 */

export const COMBAT_RULE_SOURCE = {
  classification: "canon-from-source",
  providedBy: "GM",
  recordedAt: "2026-08-03",
} as const;

export const COMBAT_DECLARATION_KINDS = ["move", "action"] as const;

export type CombatDeclarationKind =
  (typeof COMBAT_DECLARATION_KINDS)[number];

export const COMBAT_MOVEMENT_RULES = {
  enemyTurnEvasion: {
    id: "enemy-turn-evasion",
    timing: "enemy-turn",
    trigger: "enemy-attack",
    declaration: "move",
    purpose: "evade",
  },
  allyTurnMovement: {
    id: "ally-turn-movement",
    timing: "ally-turn",
    declarationsPerTurn: 2,
    movementSequences: [
      ["move", "move"],
      ["move", "action"],
      ["action", "move"],
    ],
  },
  forcedMovement: {
    id: "forced-movement",
    timing: "skill-defined",
    source: ["ally-skill", "enemy-skill"],
    resolution: "follow-skill-effect",
  },
} as const;

export const COMBAT_PERCENTAGE_ROUNDING_RULE = {
  appliesTo: "percentage-derived-damage",
  fractionThreshold: 0.5,
  belowThreshold: "discard",
  atOrAboveThreshold: "round-up",
  example: {
    baseValue: 6,
    percentage: 10,
    derivedValue: 0.6,
    appliedValue: 1,
  },
} as const;

/** 백분율 적용 후 나온 0 이상의 피해 수치를 0.5 기준으로 반올림한다. */
export function roundCombatPercentageDamage(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("전투 반올림 값은 0 이상의 유한수여야 합니다.");
  }

  const integer = Math.floor(value);
  return integer + (value - integer >= 0.5 ? 1 : 0);
}

export const COMBAT_MAP_KINDS = ["classic", "renewal"] as const;

export type CombatMapKind = (typeof COMBAT_MAP_KINDS)[number];

export interface CombatMapRule {
  kind: CombatMapKind;
  label: string;
  axes: readonly ("horizontal" | "vertical")[];
  minimumColumns: number;
  minimumRows: number;
  minimumAreas: number;
}

export const COMBAT_MAP_RULES = {
  classicHorizontal: {
    kind: "classic",
    label: "클래식 맵",
    axes: ["horizontal"],
    minimumColumns: 5,
    minimumRows: 1,
    minimumAreas: 5,
  },
  classicVertical: {
    kind: "classic",
    label: "클래식 맵",
    axes: ["vertical"],
    minimumColumns: 1,
    minimumRows: 5,
    minimumAreas: 5,
  },
  renewal: {
    kind: "renewal",
    label: "리뉴얼 맵",
    axes: ["horizontal", "vertical"],
    minimumColumns: 5,
    minimumRows: 5,
    minimumAreas: 25,
  },
} as const satisfies Record<string, CombatMapRule>;

export const COMBAT_TRAINING_MAP_PRESETS = [
  {
    id: "5x5",
    label: "5×5",
    description: "리뉴얼 맵",
    ruleKey: "renewal",
    columns: 5,
    rows: 5,
  },
  {
    id: "1x5",
    label: "1×5",
    description: "클래식 맵 · 세로",
    ruleKey: "classicVertical",
    columns: 1,
    rows: 5,
  },
  {
    id: "5x1",
    label: "5×1",
    description: "클래식 맵 · 가로",
    ruleKey: "classicHorizontal",
    columns: 5,
    rows: 1,
  },
] as const;

export type CombatTrainingMapPreset =
  (typeof COMBAT_TRAINING_MAP_PRESETS)[number];
