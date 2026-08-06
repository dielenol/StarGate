import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMigrationMode,
  planSkillTrainingMigration,
} from "../migrate-character-skill-training.ts";

test("migration은 기본 dry-run이며 execute는 이중 가드를 요구한다", () => {
  assert.deepEqual(parseMigrationMode([]), { execute: false, dryRun: true });
  assert.deepEqual(parseMigrationMode(["--yes"]), {
    execute: false,
    dryRun: true,
  });
  assert.throws(
    () => parseMigrationMode(["--execute"]),
    /--execute는 --yes와 함께/,
  );
  assert.deepEqual(parseMigrationMode(["--execute", "--yes"]), {
    execute: true,
    dryRun: false,
  });
});

test("철학 단독 및 결합 토큰은 안전하게 문학으로 변환한다", () => {
  assert.deepEqual(planSkillTrainingMigration(["관찰", "철학"]), {
    status: "update",
    original: ["관찰", "철학"],
    normalized: ["관찰", "문학"],
  });
  assert.deepEqual(planSkillTrainingMigration(["문학,철학", "관찰"]), {
    status: "update",
    original: ["문학,철학", "관찰"],
    normalized: ["문학", "관찰"],
  });
});

test("문학과 철학이 별도 토큰으로 함께 있으면 문학 하나로 통합한다", () => {
  const source = ["문학", "철학", "관찰"];
  const snapshot = structuredClone(source);

  assert.deepEqual(planSkillTrainingMigration(source), {
    status: "update",
    original: ["문학", "철학", "관찰"],
    normalized: ["문학", "관찰"],
  });
  assert.deepEqual(source, snapshot);
});

test("추정할 수 없는 타입과 표현은 변경하지 않는다", () => {
  assert.deepEqual(planSkillTrainingMigration("철학"), {
    status: "invalid_skill_training",
    original: "철학",
  });
  assert.deepEqual(planSkillTrainingMigration(["서양철학"]), {
    status: "unchanged",
    original: ["서양철학"],
    normalized: ["서양철학"],
  });
});
