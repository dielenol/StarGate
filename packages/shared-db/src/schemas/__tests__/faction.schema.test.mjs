import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  factionDocSchema,
  factionFrontmatterSchema,
  factionRelationshipSchema,
  FACTIONS_COLLECTION,
} from "../../../dist/schemas/faction.schema.js";

test("FACTIONS_COLLECTION 리터럴", () => {
  assert.equal(FACTIONS_COLLECTION, "factions");
});

test("factionDocSchema: 최소 유효 문서 통과", () => {
  const parsed = factionDocSchema.parse({
    code: "MILITARY",
    slug: "military",
    label: "군부",
    summary: "요약",
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(parsed.code, "MILITARY");
  assert.equal(parsed.isPublic, true);
});

test("factionDocSchema: isPublic 누락 거부", () => {
  assert.throws(() =>
    factionDocSchema.parse({
      code: "X_Y",
      slug: "x-y",
      label: "x",
      summary: "s",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("factionDocSchema: summary 빈 문자열 거부 (min 1)", () => {
  assert.throws(() =>
    factionDocSchema.parse({
      code: "X_Y",
      slug: "x-y",
      label: "x",
      summary: "",
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("factionDocSchema: label 40자 초과 거부", () => {
  assert.throws(() =>
    factionDocSchema.parse({
      code: "X_Y",
      slug: "x-y",
      label: "가".repeat(41),
      summary: "s",
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("factionRelationshipSchema: enum 및 note 제약", () => {
  assert.doesNotThrow(() =>
    factionRelationshipSchema.parse({
      targetCode: "COUNCIL",
      type: "ally",
    })
  );
  assert.throws(() =>
    factionRelationshipSchema.parse({
      targetCode: "COUNCIL",
      type: "enemy",
    })
  );
  assert.throws(() =>
    factionRelationshipSchema.parse({
      targetCode: "COUNCIL",
      type: "ally",
      note: "x".repeat(201),
    })
  );
});

test("factionFrontmatterSchema: createdAt ISO 문자열 허용", () => {
  assert.doesNotThrow(() =>
    factionFrontmatterSchema.parse({
      code: "EXAMPLE_FACTION",
      slug: "example-faction",
      label: "예시",
      summary: "요약",
      isPublic: false,
      createdAt: "2026-04-20T00:00:00Z",
      updatedAt: "2026-04-20T00:00:00Z",
    })
  );
});

test("factionFrontmatterSchema: createdAt Date 인스턴스 거부 (frontmatter는 string만)", () => {
  assert.throws(() =>
    factionFrontmatterSchema.parse({
      code: "EXAMPLE_FACTION",
      slug: "example-faction",
      label: "예시",
      summary: "요약",
      isPublic: false,
      createdAt: new Date(),
    })
  );
});
