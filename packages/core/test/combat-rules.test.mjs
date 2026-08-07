import assert from "node:assert/strict";
import test from "node:test";

import {
  COMBAT_MAP_RULES,
  COMBAT_MOVEMENT_RULES,
  COMBAT_PERCENTAGE_ROUNDING_RULE,
  COMBAT_TRAINING_MAP_PRESETS,
  roundCombatPercentageDamage,
} from "../dist/domain/combat-rules.js";

test("아군 차례 이동 선언은 이동 2회 또는 행동과 조합한다", () => {
  assert.equal(COMBAT_MOVEMENT_RULES.allyTurnMovement.declarationsPerTurn, 2);
  assert.deepEqual(COMBAT_MOVEMENT_RULES.allyTurnMovement.movementSequences, [
    ["move", "move"],
    ["move", "action"],
    ["action", "move"],
  ]);
});

test("적 차례 회피 이동과 스킬 강제 이동은 별도 경로로 구분한다", () => {
  assert.equal(
    COMBAT_MOVEMENT_RULES.enemyTurnEvasion.trigger,
    "enemy-attack",
  );
  assert.equal(
    COMBAT_MOVEMENT_RULES.forcedMovement.resolution,
    "follow-skill-effect",
  );
});

test("백분율 전투 수치는 소수부 0.5를 기준으로 반올림한다", () => {
  assert.equal(COMBAT_PERCENTAGE_ROUNDING_RULE.fractionThreshold, 0.5);
  assert.equal(COMBAT_PERCENTAGE_ROUNDING_RULE.appliesTo, "percentage-derived-damage");
  assert.equal(roundCombatPercentageDamage(0.49), 0);
  assert.equal(roundCombatPercentageDamage(0.5), 1);
  assert.equal(roundCombatPercentageDamage(0.6), 1);
  assert.equal(roundCombatPercentageDamage(6.49), 6);
  assert.equal(roundCombatPercentageDamage(6.5), 7);
  assert.throws(() => roundCombatPercentageDamage(-0.1), RangeError);
});

test("클래식 맵과 리뉴얼 맵의 최소 규격을 구분한다", () => {
  assert.deepEqual(
    {
      columns: COMBAT_MAP_RULES.classicHorizontal.minimumColumns,
      rows: COMBAT_MAP_RULES.classicHorizontal.minimumRows,
    },
    { columns: 5, rows: 1 },
  );
  assert.deepEqual(
    {
      columns: COMBAT_MAP_RULES.classicVertical.minimumColumns,
      rows: COMBAT_MAP_RULES.classicVertical.minimumRows,
    },
    { columns: 1, rows: 5 },
  );
  assert.deepEqual(
    {
      columns: COMBAT_MAP_RULES.renewal.minimumColumns,
      rows: COMBAT_MAP_RULES.renewal.minimumRows,
    },
    { columns: 5, rows: 5 },
  );
  assert.deepEqual(
    COMBAT_TRAINING_MAP_PRESETS.map(({ id, ruleKey }) => [id, ruleKey]),
    [
      ["5x5", "renewal"],
      ["8x8", "renewal"],
      ["1x5", "classicVertical"],
      ["5x1", "classicHorizontal"],
    ],
  );
  assert.deepEqual(
    COMBAT_TRAINING_MAP_PRESETS.find(({ id }) => id === "8x8"),
    {
      id: "8x8",
      label: "8×8",
      description: "리뉴얼 맵 · 확장",
      ruleKey: "renewal",
      columns: 8,
      rows: 8,
    },
  );
});
