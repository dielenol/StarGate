import { test } from "node:test";
import { strict as assert } from "node:assert";

import { buildShopReorderRequestId } from "../reorder-request-id.ts";

test("shop reorder request id keeps the first request legacy-compatible", () => {
  assert.equal(
    buildShopReorderRequestId("2026-07-09", "user-1", "test-item", 1),
    "shop-reorder:2026-07-09:user-1:test-item",
  );
});

test("shop reorder request id appends sequence for same-day retries", () => {
  assert.equal(
    buildShopReorderRequestId("2026-07-09", "user-1", "test-item", 2),
    "shop-reorder:2026-07-09:user-1:test-item:2",
  );
});
