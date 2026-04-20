import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  institutionDocSchema,
  institutionFrontmatterSchema,
  institutionSubUnitSchema,
  INSTITUTIONS_COLLECTION,
} from "../../../dist/schemas/institution.schema.js";

test("INSTITUTIONS_COLLECTION 리터럴", () => {
  assert.equal(INSTITUTIONS_COLLECTION, "institutions");
});

test("institutionSubUnitSchema: 기본 필드", () => {
  const parsed = institutionSubUnitSchema.parse({
    code: "RESEARCH",
    label: "연구 기구",
  });
  assert.equal(parsed.code, "RESEARCH");
  assert.equal(parsed.summary, undefined);
});

test("institutionSubUnitSchema: code UPPER_SNAKE 강제", () => {
  assert.throws(() =>
    institutionSubUnitSchema.parse({ code: "research", label: "연구" })
  );
});

test("institutionDocSchema: 전체 유효 통과", () => {
  const parsed = institutionDocSchema.parse({
    code: "SECRETARIAT",
    slug: "secretariat",
    label: "사무국",
    parentFactionCode: "COUNCIL",
    subUnits: [{ code: "RESEARCH", label: "연구" }],
    summary: "요약",
    isPublic: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(parsed.subUnits?.length, 1);
});

test("institutionDocSchema: parentFactionCode 소문자 거부", () => {
  assert.throws(() =>
    institutionDocSchema.parse({
      code: "SECRETARIAT",
      slug: "secretariat",
      label: "사무국",
      parentFactionCode: "council",
      summary: "요약",
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("institutionDocSchema: headquartersLocation 120자 초과 거부", () => {
  assert.throws(() =>
    institutionDocSchema.parse({
      code: "FIN",
      slug: "fin",
      label: "x",
      summary: "s",
      headquartersLocation: "a".repeat(121),
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
});

test("institutionFrontmatterSchema: createdAt 생략 허용", () => {
  assert.doesNotThrow(() =>
    institutionFrontmatterSchema.parse({
      code: "FIN",
      slug: "fin",
      label: "재무국",
      summary: "요약",
      isPublic: false,
    })
  );
});
