import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  catalogSlugSchema,
  codeSchema,
  slugSchema,
  objectIdStringSchema,
  isoDateStringSchema,
  loreSourceSchema,
} from "../../../dist/schemas/common.js";

test("codeSchema: UPPER_SNAKE_CASE 식별자 허용", () => {
  assert.equal(codeSchema.parse("MILITARY"), "MILITARY");
  assert.equal(codeSchema.parse("SECRETARIAT"), "SECRETARIAT");
  assert.equal(codeSchema.parse("FOO_BAR_1"), "FOO_BAR_1");
  assert.equal(codeSchema.parse("_LEADING_UNDERSCORE"), "_LEADING_UNDERSCORE");
});

test("codeSchema: 소문자·대시·숫자 시작 거부", () => {
  assert.throws(() => codeSchema.parse("military"));
  assert.throws(() => codeSchema.parse("FOO-BAR"));
  assert.throws(() => codeSchema.parse("1FOO"));
  assert.throws(() => codeSchema.parse("A")); // min 2
  assert.throws(() => codeSchema.parse(""));
});

test("slugSchema: kebab-case 소문자 허용", () => {
  assert.equal(slugSchema.parse("registrar"), "registrar");
  assert.equal(slugSchema.parse("example-faction"), "example-faction");
  assert.equal(slugSchema.parse("a-b-c-1"), "a-b-c-1");
});

test("slugSchema: 대문자·언더바·연속 대시 거부", () => {
  assert.throws(() => slugSchema.parse("Foo"));
  assert.throws(() => slugSchema.parse("foo_bar"));
  assert.throws(() => slugSchema.parse("foo--bar"));
  assert.throws(() => slugSchema.parse(""));
});

test("catalogSlugSchema: kebab-case와 shop underscore slug 허용", () => {
  assert.equal(catalogSlugSchema.parse("first-aid-patch"), "first-aid-patch");
  assert.equal(catalogSlugSchema.parse("first_aid_patch"), "first_aid_patch");
  assert.equal(catalogSlugSchema.parse("cup_ramen"), "cup_ramen");
});

test("catalogSlugSchema: 대문자·연속 구분자·끝 구분자 거부", () => {
  assert.throws(() => catalogSlugSchema.parse("Foo"));
  assert.throws(() => catalogSlugSchema.parse("foo__bar"));
  assert.throws(() => catalogSlugSchema.parse("foo--bar"));
  assert.throws(() => catalogSlugSchema.parse("foo_"));
  assert.throws(() => catalogSlugSchema.parse(""));
});

test("objectIdStringSchema: 24자 hex 허용", () => {
  assert.equal(
    objectIdStringSchema.parse("507f1f77bcf86cd799439011"),
    "507f1f77bcf86cd799439011"
  );
  assert.throws(() => objectIdStringSchema.parse("507f1f77bcf86cd79943901")); // 23자
  assert.throws(() => objectIdStringSchema.parse("507f1f77bcf86cd799439011z")); // 비-hex
});

test("isoDateStringSchema: ISO 8601 허용", () => {
  assert.equal(
    isoDateStringSchema.parse("2026-04-20T00:00:00Z"),
    "2026-04-20T00:00:00Z"
  );
  assert.throws(() => isoDateStringSchema.parse("2026-04-20"));
  assert.throws(() => isoDateStringSchema.parse("not-a-date"));
});

test("loreSourceSchema: enum 허용값만 통과", () => {
  for (const v of ["discord", "legacy-json", "manual", "create-lore"]) {
    assert.equal(loreSourceSchema.parse(v), v);
  }
  assert.throws(() => loreSourceSchema.parse("unknown"));
  assert.throws(() => loreSourceSchema.parse(""));
});
