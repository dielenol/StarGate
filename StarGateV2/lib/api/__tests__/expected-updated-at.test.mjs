import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpectedUpdatedAtCurrent,
  parseExpectedUpdatedAt,
} from "../expected-updated-at.ts";

test("expectedUpdatedAt은 누락을 거부하고 null legacy 버전을 허용한다", () => {
  assert.deepEqual(parseExpectedUpdatedAt({}), {
    ok: false,
    error: "expectedUpdatedAt은 null 또는 ISO 날짜 문자열로 필요합니다.",
  });
  assert.deepEqual(parseExpectedUpdatedAt({ expectedUpdatedAt: null }), {
    ok: true,
    value: null,
  });
  assert.equal(isExpectedUpdatedAtCurrent(undefined, null), true);
  assert.equal(isExpectedUpdatedAtCurrent(null, null), true);
  assert.equal(
    isExpectedUpdatedAtCurrent("2026-07-30T00:00:00.000Z", null),
    false,
  );
});

test("expectedUpdatedAt은 같은 시각만 현재 버전으로 인정한다", () => {
  const parsed = parseExpectedUpdatedAt({
    expectedUpdatedAt: "2026-07-30T00:00:00.000Z",
  });
  assert.equal(parsed.ok, true);
  assert.equal(
    isExpectedUpdatedAtCurrent(
      new Date("2026-07-30T00:00:00.000Z"),
      parsed.ok ? parsed.value : null,
    ),
    true,
  );
  assert.equal(
    isExpectedUpdatedAtCurrent(
      "2026-07-30T00:00:01.000Z",
      parsed.ok ? parsed.value : null,
    ),
    false,
  );
  assert.equal(
    parseExpectedUpdatedAt({ expectedUpdatedAt: "not-a-date" }).ok,
    false,
  );
});
