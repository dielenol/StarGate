import { strict as assert } from "node:assert";
import test from "node:test";

import {
  assertSingleFileExecutionScope,
  mergeSeedProvenanceSourceIds,
  normalizeSeedPayloadDates,
  withSeedRunnerInsertUpdatedAt,
} from "../seed-payload-normalization.ts";

const ISO = "2026-08-05T12:34:56.000Z";

test("root Mongo 메타데이터 날짜만 Date로 변환한다", () => {
  const normalized = normalizeSeedPayloadDates({
    createdAt: ISO,
    updatedAt: ISO,
    lore: {
      observedAt: ISO,
      nested: { createdAt: ISO },
    },
  });

  assert.ok(normalized.createdAt instanceof Date);
  assert.ok(normalized.updatedAt instanceof Date);
  assert.equal(normalized.lore.observedAt, ISO);
  assert.equal(normalized.lore.nested.createdAt, ISO);
});

test("update operator의 root 날짜는 변환하되 dotted lore 날짜는 문자열로 보존한다", () => {
  const normalized = normalizeSeedPayloadDates({
    $set: {
      updatedAt: ISO,
      "lore.observedAt": ISO,
      "play.history.0.createdAt": ISO,
    },
  });

  assert.ok(normalized.$set.updatedAt instanceof Date);
  assert.equal(normalized.$set["lore.observedAt"], ISO);
  assert.equal(normalized.$set["play.history.0.createdAt"], ISO);
});

test("multi-file WRITE는 부분 commit을 막기 위해 거부하고 dry-run만 허용한다", () => {
  assert.doesNotThrow(() =>
    assertSingleFileExecutionScope(["a.json", "b.json"], false),
  );
  assert.doesNotThrow(() =>
    assertSingleFileExecutionScope(["a.json"], true),
  );
  assert.throws(
    () => assertSingleFileExecutionScope(["a.json", "b.json"], true),
    /WRITE는 파일 1개만 허용합니다/,
  );
});

test("report provenance ledger는 add-only이고 동일 source 재실행이 멱등이다", () => {
  const first = mergeSeedProvenanceSourceIds(
    ["seed:b"],
    "seed:a",
    "seed:legacy",
  );
  assert.deepEqual(first, ["seed:a", "seed:b", "seed:legacy"]);
  assert.deepEqual(
    mergeSeedProvenanceSourceIds(first, "seed:a"),
    first,
  );
  assert.throws(
    () => mergeSeedProvenanceSourceIds("seed:a", "seed:b"),
    /문자열 배열/,
  );
});

test("update upsert insert dry-run은 runner-owned updatedAt을 합성한다", () => {
  const now = new Date(ISO);
  assert.deepEqual(
    withSeedRunnerInsertUpdatedAt({ slug: "example" }, true, now),
    { slug: "example", updatedAt: now },
  );
  assert.deepEqual(
    withSeedRunnerInsertUpdatedAt({ slug: "example" }, false, now),
    { slug: "example" },
  );
  const preserved = new Date("2026-08-04T00:00:00.000Z");
  assert.deepEqual(
    withSeedRunnerInsertUpdatedAt(
      { slug: "example", updatedAt: preserved },
      true,
      now,
    ),
    { slug: "example", updatedAt: preserved },
  );
});
