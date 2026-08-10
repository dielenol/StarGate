import assert from "node:assert/strict";
import test from "node:test";

import {
  childIdempotencyKey,
  isValidIdempotencyKey,
} from "../idempotency.ts";

test("child idempotency keys preserve distinct suffixes at max parent length", () => {
  const parent = "p".repeat(128);
  const first = childIdempotencyKey(parent, "character-a:credit");
  const second = childIdempotencyKey(parent, "character-b:credit");

  assert.notEqual(first, second);
  assert.equal(isValidIdempotencyKey(first), true);
  assert.equal(isValidIdempotencyKey(second), true);
  assert.ok(first.length <= 128);
  assert.ok(second.length <= 128);
});

test("max parent의 잘린 뒤쪽만 다른 요청도 hash로 충돌하지 않는다", () => {
  const sharedPrefix = "p".repeat(127);
  const first = childIdempotencyKey(`${sharedPrefix}a`, "research-debit");
  const second = childIdempotencyKey(`${sharedPrefix}b`, "research-debit");

  assert.notEqual(first, second);
  assert.equal(childIdempotencyKey(`${sharedPrefix}a`, "research-debit"), first);
  assert.equal(isValidIdempotencyKey(first), true);
  assert.equal(isValidIdempotencyKey(second), true);
  assert.ok(first.length <= 128);
  assert.ok(second.length <= 128);
});
