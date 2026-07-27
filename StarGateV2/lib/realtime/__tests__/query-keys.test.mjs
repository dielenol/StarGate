import assert from "node:assert/strict";
import test from "node:test";

import { queryKeysForRealtimeResources } from "../query-keys.ts";

test("realtime resource는 기존 TanStack Query root key로만 확장된다", () => {
  assert.deepEqual(queryKeysForRealtimeResources(["characters"]), [
    ["characters"],
    ["character-change-logs"],
    ["character-edit-quota"],
  ]);
  assert.deepEqual(
    queryKeysForRealtimeResources(["credits", "page-locks"]),
    [["credits"], ["credits-admin"], ["erp-page-locks"]],
  );
});
