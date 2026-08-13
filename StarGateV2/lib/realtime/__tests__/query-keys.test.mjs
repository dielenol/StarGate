import assert from "node:assert/strict";
import test from "node:test";

import { queryKeysForRealtimeResources } from "../query-keys.ts";

test("realtime resource는 기존 TanStack Query root key로만 확장된다", () => {
  assert.deepEqual(queryKeysForRealtimeResources(["characters"]), [
    ["characters"],
    ["character-change-logs"],
    ["character-edit-quota"],
    ["personnel"],
    ["trades"],
    ["dashboard"],
    ["factions"],
    ["account"],
    ["wiki", "lore-search"],
  ]);
  assert.deepEqual(
    queryKeysForRealtimeResources(["credits", "page-locks"]),
    [
      ["credits"],
      ["credits-admin"],
      ["trades"],
      ["dashboard"],
      ["erp-page-locks"],
    ],
  );
});

test("복합 resource가 같은 Query root를 공유해도 한 번만 반환한다", () => {
  assert.deepEqual(
    queryKeysForRealtimeResources(["characters", "users", "credits"]),
    [
      ["characters"],
      ["character-change-logs"],
      ["character-edit-quota"],
      ["personnel"],
      ["trades"],
      ["dashboard"],
      ["factions"],
      ["account"],
      ["wiki", "lore-search"],
      ["users"],
      ["credits"],
      ["credits-admin"],
    ],
  );
});

test("상위 Query key가 있으면 같은 invalidation 범위의 하위 key를 제거한다", () => {
  assert.deepEqual(queryKeysForRealtimeResources(["wiki"]), [
    ["wiki"],
    ["dashboard"],
    ["factions"],
  ]);
  assert.deepEqual(
    queryKeysForRealtimeResources(["reports", "wiki"]),
    [["session-reports"], ["dashboard"], ["factions"], ["wiki"]],
  );
});
