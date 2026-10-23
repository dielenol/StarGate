import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { DiceRollError, rollDiceExpression } = await import(
  "../dist/utils/dice-roller.js"
);
const { buildDiceRollContent, DICE_HELP_TEXT } = await import(
  "../dist/commands/dice-roll.js"
);

/**
 * 지정한 눈을 순서대로 내는 rng. `rollOne` 이 `floor(rng * sides) + 1` 로 눈을
 * 정하므로 각 값의 칸 가운데를 돌려준다. 값이 바닥나면 마지막 값을 반복한다.
 */
function dice(sides, ...values) {
  return mixed(...values.map((value) => [sides, value]));
}

/** 면 수가 다른 주사위를 섞을 때: `mixed([20, 6], [4, 4])` = d20 에서 6, d4 에서 4 */
function mixed(...pairs) {
  let index = 0;
  return () => {
    const [sides, value] = pairs[Math.min(index, pairs.length - 1)];
    index += 1;
    return (value - 1 + 0.5) / sides;
  };
}

function roll(input, rng) {
  return rollDiceExpression(input, { rng });
}

test("기본 주사위와 산술은 연산 우선순위대로 계산한다", () => {
  assert.equal(roll("2d6", dice(6, 3, 5)).rolls[0].total, 8);
  assert.equal(roll("1d20+5", dice(20, 13)).rolls[0].total, 18);
  assert.equal(roll("(1d4+1)*2", dice(4, 3)).rolls[0].total, 8);
  assert.equal(roll("1d20-1d4", mixed([20, 6], [4, 4])).rolls[0].total, 2);
});

test("keep/drop 옵션은 지정한 개수만 합산한다", () => {
  assert.equal(roll("4d6 k3", dice(6, 1, 2, 3, 4)).rolls[0].total, 9);
  assert.equal(roll("4d6 kl1", dice(6, 1, 2, 3, 4)).rolls[0].total, 1);
  assert.equal(roll("4d6 d1", dice(6, 1, 2, 3, 4)).rolls[0].total, 9);
});

test("폭발·성공 판정 옵션을 처리한다", () => {
  assert.equal(roll("1d6 e", dice(6, 6, 3)).rolls[0].total, 9);
  assert.equal(roll("6d10 t7", dice(10, 7, 8, 1, 2, 10, 3)).rolls[0].total, 3);
});

test("별칭 +d20 은 2개 중 높은 값을 쓴다", () => {
  assert.equal(roll("+d20", dice(20, 4, 17)).rolls[0].total, 17);
});

test("연산자 없이 이어진 항은 다른 식으로 해석하지 않고 거부한다", () => {
  for (const input of ["1d20 5", "2d6 1d4", "2d6 3", "(1d6) 2"]) {
    assert.throws(
      () => roll(input, dice(20, 1)),
      (error) => error instanceof DiceRollError && /연산자/.test(error.message),
      input,
    );
  }
});

test("공백으로 띄운 옵션 문자는 계속 허용한다", () => {
  assert.equal(roll("10d6 e6 k8 +4", dice(6, 1)).rolls[0].total, 12);
  assert.equal(roll("2d20 d1", dice(20, 4, 17)).rolls[0].total, 17);
});

test("앞에 쓴 보정치는 반복 횟수로 오해하지 않는다", () => {
  const result = roll("5 + 1d20", dice(20, 10));
  assert.equal(result.rolls.length, 1);
  assert.equal(result.rolls[0].total, 15);
  assert.equal(roll("3 - 1d6", dice(6, 2)).rolls[0].total, 1);
});

test("반복 횟수는 2-20회만 허용한다", () => {
  assert.equal(roll("6 4d6 k3", dice(6, 3)).rolls.length, 6);
  assert.throws(() => roll("21 1d6", dice(6, 1)), /반복 횟수/);
  assert.throws(() => roll("1 1d20", dice(20, 1)), /반복 횟수/);
});

test("무한 리롤이 100회 안에 조건을 만족하지 못하면 결과를 채택하지 않는다", () => {
  assert.throws(
    () => roll("1d6 ir5", dice(6, 1)),
    (error) => error instanceof DiceRollError && /100회/.test(error.message),
  );
  assert.throws(() => roll("4dF r1", dice(3, 1)), /Fudge/);
});

test("범용 판정은 식 끝의 비교 기호와 목표치로 성공 여부를 정한다", () => {
  const success = roll("1d100+10 >= 65", dice(100, 60)).rolls[0];
  assert.equal(success.total, 70);
  assert.deepEqual(success.comparison, { operator: ">=", target: 65, passed: true });

  const failure = roll("2d6 <= 7", dice(6, 4, 5)).rolls[0];
  assert.equal(failure.comparison.passed, false);

  assert.equal(roll("1d20 == 20", dice(20, 20)).rolls[0].comparison.operator, "=");
  assert.throws(() => roll("1d20 >= 15 + 2", dice(20, 1)), /판정은/);
  assert.throws(() => roll("1d20 >= 1d6", dice(20, 1)), /판정은/);
});

test("입력·결과 상한을 넘으면 거부한다", () => {
  assert.throws(() => roll("1d6+".repeat(130), dice(6, 1)), /최대 500자/);
  assert.throws(() => roll("1d6;1d6;1d6;1d6;1d6", dice(6, 1)), /최대 4개/);
  assert.throws(() => roll("101d6", dice(6, 1)), /1-100개/);
  assert.throws(() => roll("1d1001", dice(1000, 1)), /2-1000/);
  assert.throws(() => roll("20 100d6", dice(6, 1)), /최대 1000개/);
});

test("안전 정수 범위를 넘는 숫자는 Infinity 로 표시하지 않고 거부한다", () => {
  const huge = "9".repeat(400);
  for (const input of [`1d6+${huge}`, `1d6 >= ${huge}`, `1d6*${huge}`, `1d6+${huge}.5`]) {
    assert.throws(
      () => roll(input, dice(6, 1)),
      (error) => error instanceof DiceRollError && /숫자가 너무 큽니다/.test(error.message),
      input,
    );
  }
  // 리터럴은 안전해도 연산 결과가 넘치면 거부한다.
  assert.throws(
    () => roll(`1d6*${"9".repeat(15)}*${"9".repeat(15)}`, dice(6, 1)),
    /숫자가 너무 큽니다/,
  );
  assert.equal(roll(`1d6+${Number.MAX_SAFE_INTEGER - 6}`, dice(6, 1)).rolls[0].total, Number.MAX_SAFE_INTEGER - 5);
});

test("결과 메시지는 실제 연산자와 상수를 그대로 보여준다", () => {
  const content = buildDiceRollContent(
    roll("1d20-1d4", mixed([20, 6], [4, 4])),
    "GM",
  );
  assert.match(content, /1d20 `\[6\]` - 1d4 `\[4\]` = \*\*2\*\*/);

  const withConstant = buildDiceRollContent(roll("1d20+5", dice(20, 13)), "GM");
  assert.match(withConstant, /1d20 `\[13\]` \+ 5 = \*\*18\*\*/);

  const single = buildDiceRollContent(roll("2d6", dice(6, 3, 5)), "GM");
  assert.match(single, /Roll: `\[3, 5\]` = \*\*8\*\*/);
});

test("판정 결과와 반복 판정 요약을 표시한다", () => {
  const content = buildDiceRollContent(roll("3 1d20 >= 10", dice(20, 15, 3, 10)), "GM");
  assert.match(content, /Roll #1: `\[15\]` = \*\*15\*\* ≥ 10 → ✅ 성공/);
  assert.match(content, /Roll #2: `\[3\]` = \*\*3\*\* ≥ 10 → ❌ 실패/);
  assert.match(content, /판정: 성공 2\/3/);
});

test("긴 결과도 메시지 상한 안에서 합계를 잃지 않는다", () => {
  const many = buildDiceRollContent(roll("10 100d100", dice(100, 55)), "GM");
  assert.ok(many.length <= 1900, `length=${many.length}`);
  const rollLines = many.split("\n").filter((line) => line.startsWith("Roll #"));
  assert.ok(rollLines.length > 0);
  for (const line of rollLines) assert.match(line, /\*\*\d+\*\*/);

  const single = buildDiceRollContent(roll("100d1000 ie", dice(1000, 999)), "GM");
  assert.ok(single.length <= 1900, `length=${single.length}`);
  assert.match(single, /= \*\*\d+\*\*/);
});

test("주석의 마스킹 링크·멘션·마크다운은 이스케이프한다", () => {
  const content = buildDiceRollContent(
    roll("1d20 ![공지](https://evil.example) <@&123> **굵게**", dice(20, 7)),
    "GM",
  );
  assert.match(content, /Note: \\\[공지\\\]\\\(https:\/\/evil\.example\\\) \\<@&123\\> \\\*\\\*굵게\\\*\\\*/);
});

test("도움말은 판정 문법을 안내한다", () => {
  assert.match(DICE_HELP_TEXT, /1d100\+10 >= 65/);
});
