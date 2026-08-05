import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  hashStaticBaselineDocument,
  validateStaticLoreBaseline,
} from "../static-lore-baseline.ts";

const VALID = {
  version: 1,
  environment: "live",
  database: "stargate",
  observedAt: "2026-08-05T00:00:00.000Z",
  expiresAt: "2026-09-04T00:00:00.000Z",
  targets: [
    {
      kind: "wiki",
      key: "black-pyramid",
      aliases: ["블랙 피라미드"],
      evidence: "read-only inventory",
      observedUpdatedAt: "2026-08-05T00:00:00.000Z",
      contentHash: "a".repeat(64),
    },
  ],
};

test("static baseline은 31일 이하의 유효한 관측만 허용한다", () => {
  assert.equal(
    validateStaticLoreBaseline(VALID, new Date("2026-08-06T00:00:00.000Z")).targets.length,
    1,
  );
  assert.throws(
    () => validateStaticLoreBaseline(VALID, new Date("2026-09-05T00:00:00.000Z")),
    /만료/,
  );
  assert.throws(
    () => validateStaticLoreBaseline({ ...VALID, expiresAt: "2026-10-05T00:00:00.000Z" }),
    /31일/,
  );
});

test("baseline content hash는 Mongo metadata가 아닌 renderer payload 변경만 반영한다", () => {
  const first = hashStaticBaselineDocument({
    _id: "one",
    slug: "black-pyramid",
    title: "블랙 피라미드",
    content: "본문",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-05T00:00:00.000Z"),
  });
  const metadataOnly = hashStaticBaselineDocument({
    _id: "two",
    slug: "black-pyramid",
    title: "블랙 피라미드",
    content: "본문",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
  });
  const changed = hashStaticBaselineDocument({
    slug: "black-pyramid",
    title: "블랙 피라미드",
    content: "변경",
  });
  assert.equal(first, metadataOnly);
  assert.notEqual(first, changed);
});
