import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSkillTraining,
  parseEditedSkillTrainingInput,
  parseSkillTrainingInput,
} from "../skill-training.ts";

test("정확한 철학 및 문학,철학 토큰을 문학으로 표준화하고 중복 제거한다", () => {
  assert.deepEqual(
    normalizeSkillTraining(["관찰", "철학", "문학,철학", "문학", "관찰"]),
    ["관찰", "문학"],
  );
});

test("부분 문자열이나 공백이 다른 표현은 추정하여 바꾸지 않는다", () => {
  assert.deepEqual(
    normalizeSkillTraining(["서양철학", " 철학", "철학 ", "문학, 철학"]),
    ["서양철학", " 철학", "철학 ", "문학, 철학"],
  );
});

test("API 입력은 string[]만 허용한다", () => {
  assert.deepEqual(parseSkillTrainingInput("철학"), { success: false });
  assert.deepEqual(parseSkillTrainingInput(["철학", 1]), { success: false });
  assert.deepEqual(parseSkillTrainingInput(["철학", "문학"]), {
    success: true,
    data: ["문학"],
  });
});

test("편집 API는 저장값과 같은 레거시 배열을 암묵적으로 바꾸지 않는다", () => {
  assert.deepEqual(
    parseEditedSkillTrainingInput(["문학", "철학"], ["문학", "철학"]),
    { success: true, data: ["문학", "철학"] },
  );
  assert.deepEqual(
    parseEditedSkillTrainingInput(["철학", "관찰"], ["철학"]),
    { success: true, data: ["문학", "관찰"] },
  );
  assert.deepEqual(parseEditedSkillTrainingInput("철학", ["철학"]), {
    success: false,
  });
});
