import assert from "node:assert/strict";
import { test } from "node:test";

import { compareIndexSpec } from "../index-spec.ts";

const expected = {
  collection: "events",
  name: "events_operation_unique",
  key: { operationKey: 1, createdAt: -1 },
  unique: true,
  partialFilterExpression: { operationKey: { $type: "string" } },
  expireAfterSeconds: 60,
};

function actual(overrides = {}) {
  return {
    v: 2,
    name: expected.name,
    key: { operationKey: 1, createdAt: -1 },
    unique: true,
    partialFilterExpression: { operationKey: { $type: "string" } },
    expireAfterSeconds: 60,
    ...overrides,
  };
}

test("accepts the exact key order and index options", () => {
  assert.deepEqual(compareIndexSpec(expected, actual()), []);
});

test("rejects same-name indexes with a different key order", () => {
  assert.deepEqual(
    compareIndexSpec(
      expected,
      actual({ key: { createdAt: -1, operationKey: 1 } }),
    ),
    ["key"],
  );
});

test("rejects wrong unique, partial, and TTL options", () => {
  assert.deepEqual(
    compareIndexSpec(
      expected,
      actual({
        unique: false,
        partialFilterExpression: { operationKey: { $exists: true } },
        expireAfterSeconds: 120,
      }),
    ),
    ["unique", "partialFilterExpression", "expireAfterSeconds"],
  );
});
