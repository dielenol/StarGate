import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeysForRealtimeResources } from "../query-keys.ts";

test("업무 상태 이벤트는 아직 fresh인 대시보드도 갱신한다", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: ["dashboard"],
    queryFn: async () => ({ revision: ++reads }),
    initialData: { revision: 0 },
    staleTime: 60_000,
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    for (const resource of ["trades", "equipment-shop", "inventory", "page-locks"]) {
      const before = reads;
      await Promise.all(queryKeysForRealtimeResources([resource]).map(queryKey =>
        client.invalidateQueries({ queryKey }),
      ));
      assert.equal(reads, before + 1, `${resource} 변경 후 home의 업무 상태를 다시 읽어야 함`);
    }
  } finally {
    unsubscribe();
    client.clear();
  }
});

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
    ["hall-of-fame"],
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
  assert.deepEqual(queryKeysForRealtimeResources(["gallery"]), [["gallery"]]);
  assert.deepEqual(queryKeysForRealtimeResources(["hall-of-fame"]), [
    ["hall-of-fame"],
  ]);
  assert.deepEqual(queryKeysForRealtimeResources(["hall-of-fame-novex"]), [
    ["hall-of-fame", "overview"],
    ["hall-of-fame", "novex"],
  ]);
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
      ["hall-of-fame"],
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
    [
      ["session-reports"],
      ["gallery"],
      ["dashboard"],
      ["factions"],
      ["wiki"],
    ],
  );
});
