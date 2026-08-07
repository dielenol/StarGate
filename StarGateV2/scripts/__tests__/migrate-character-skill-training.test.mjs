import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseMigrationMode,
  planSkillTrainingMigration,
} from "../migrate-character-skill-training.ts";

test("완료된 migration은 dry-run 진단만 허용한다", () => {
  assert.deepEqual(parseMigrationMode([]), { execute: false, dryRun: true });
  assert.deepEqual(parseMigrationMode(["--yes"]), {
    execute: false,
    dryRun: true,
  });
  assert.throws(
    () => parseMigrationMode(["--execute"]),
    /직접 실행 경로가 폐쇄/,
  );
  assert.throws(
    () => parseMigrationMode(["--execute", "--yes"]),
    /직접 실행 경로가 폐쇄/,
  );
});

test("진단 스크립트에 MongoDB mutation 호출이 남아 있지 않다", () => {
  const source = readFileSync(
    new URL("../migrate-character-skill-training.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\.(?:bulkWrite|insert(?:One|Many)?|replaceOne|update(?:One|Many)?|delete(?:One|Many)?|remove|save|findAndModify|findAndRemove|findOneAnd(?:Delete|Replace|Update)|initialize(?:Ordered|Unordered)BulkOp|create(?:Index|Indexes|SearchIndex|SearchIndexes)|updateSearchIndex|drop(?:Index|Indexes|SearchIndex|SearchIndexes)?|rename|mapReduce)\s*\(/u,
  );
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
