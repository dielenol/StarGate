import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  stringToEditedSkillTraining,
  stringToSkillTraining,
} from "../../../../(erp)/erp/characters/_form-utils.ts";
import {
  parseEditedSkillTrainingInput,
  parseSkillTrainingInput,
} from "../../../../../lib/character/skill-training.ts";

const POST_ROUTE_URL = new URL("../route.ts", import.meta.url);
const PATCH_ROUTE_URL = new URL("../[id]/route.ts", import.meta.url);

test("생성·편집 폼 입력은 철학 표기를 문학으로 통합한다", () => {
  assert.deepEqual(
    stringToSkillTraining("관찰, 철학, 문학,철학"),
    ["관찰", "문학"],
  );
});

test("편집하지 않은 기존 문학·철학 충돌값은 암묵적으로 migration하지 않는다", () => {
  assert.deepEqual(
    stringToEditedSkillTraining("문학, 철학", ["문학", "철학"]),
    ["문학", "철학"],
  );
  assert.deepEqual(
    stringToEditedSkillTraining("문학, 철학, 관찰", ["문학", "철학"]),
    ["문학", "관찰"],
  );
});

test("직접 API 입력도 문자열 배열만 받고 같은 정규화를 사용한다", () => {
  assert.deepEqual(parseSkillTrainingInput(["철학", "문학,철학", "관찰"]), {
    success: true,
    data: ["문학", "관찰"],
  });
  assert.deepEqual(parseSkillTrainingInput({ 0: "철학" }), {
    success: false,
  });
  assert.deepEqual(
    parseEditedSkillTrainingInput(["문학", "철학"], ["문학", "철학"]),
    { success: true, data: ["문학", "철학"] },
  );
});

test("POST와 PATCH 라우트가 공통 skillTraining 경계를 호출한다", async () => {
  const [postRoute, patchRoute] = await Promise.all([
    readFile(POST_ROUTE_URL, "utf8"),
    readFile(PATCH_ROUTE_URL, "utf8"),
  ]);

  assert.match(postRoute, /parseSkillTrainingInput\(/);
  assert.match(postRoute, /skillTraining:\s*skillTrainingResult\.data/);
  assert.match(patchRoute, /parseEditedSkillTrainingInput\(/);
  assert.match(patchRoute, /before\.play\.skillTraining/);
  assert.match(patchRoute, /play\.skillTraining = parsed\.data/);
});
