/**
 * Validator 검증 — S3 refetchOnMount:"always" 제거 + initialData 조합 (Phase 1)
 *
 * TanStack Query v5 의 실제 런타임(QueryClient + QueryObserver)으로,
 * useCredits / useCharacterInventory / useShopCatalog / useStockHoldings 가
 * 의존하는 캐시 semantics 를 검증한다 (옵션 조합은 해당 훅에서 INLINED —
 * 훅 파일 자체는 @/lib 런타임 alias 때문에 직접 import 하지 않는다).
 *
 * 시나리오:
 *   Q-1: initialData + staleTime → 마운트(구독) 시 queryFn 미호출 (중복 페치 제거 확인)
 *   Q-2: (구버전 대조) refetchOnMount:"always" 였다면 fresh 여도 페치가 발생했음
 *   Q-3: invalidateQueries → staleTime 내에서도 active observer 즉시 refetch
 *        (뮤테이션 onSuccess 경로가 여전히 즉시 갱신함을 보장)
 *   Q-4: refetchOnWindowFocus:true — fresh 면 포커스 refetch 없음,
 *        stale 이면 포커스 refetch 발생 ("always" 제거의 의도된 delta)
 *   Q-5: staleTime 경과 후 재구독(재마운트 상당) → refetch 발생 (자가 교정 유지)
 *
 * 실행:
 *   cd StarGateV2 && node --test hooks/__tests__/query-refetch-behavior.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QueryClient,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query";

const tick = () => new Promise((r) => setTimeout(r, 20));

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

function makeCountingFetcher(payload = { balance: 100 }) {
  const stats = { calls: 0 };
  const fn = async () => {
    stats.calls += 1;
    return payload;
  };
  return { fn, stats };
}

/** useCredits 의 캐시 옵션 (INLINED FROM hooks/queries/useCreditsQuery.ts) */
const CREDITS_LIKE = {
  queryKey: ["credits", "me"],
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
};

const RSC_LIST_LIKE = {
  queryKey: ["wiki", "list", {}],
  staleTime: 30 * 1000,
};

test("Q-1: initialData + staleTime → 구독(마운트) 시 queryFn 미호출", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher();
  const observer = new QueryObserver(client, {
    ...CREDITS_LIKE,
    queryFn: fn,
    initialData: { balance: 42 },
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  assert.equal(stats.calls, 0, "RSC 시드 후 마운트 중복 페치가 없어야 함");
  assert.deepEqual(observer.getCurrentResult().data, { balance: 42 });
  assert.equal(observer.getCurrentResult().isStale, false);
  unsubscribe();
  client.clear();
});

test("Q-2: (구버전 대조) refetchOnMount:'always' 는 fresh 여도 페치", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher();
  const observer = new QueryObserver(client, {
    ...CREDITS_LIKE,
    queryFn: fn,
    initialData: { balance: 42 },
    refetchOnMount: "always",
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  assert.equal(stats.calls, 1, "구 설정에서는 마운트 페치가 1회 발생했음 (제거 근거)");
  unsubscribe();
  client.clear();
});

test("Q-3: invalidateQueries → staleTime 내에서도 즉시 refetch", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher();
  const observer = new QueryObserver(client, {
    ...CREDITS_LIKE,
    queryFn: fn,
    initialData: { balance: 42 },
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();
  assert.equal(stats.calls, 0);

  // 뮤테이션 onSuccess 경로 재현 — creditKeys.all prefix invalidate
  await client.invalidateQueries({ queryKey: ["credits"] });
  await tick();

  assert.equal(
    stats.calls,
    1,
    "invalidate 는 staleTime 과 무관하게 active 쿼리를 즉시 refetch 해야 함",
  );
  assert.deepEqual(observer.getCurrentResult().data, { balance: 100 });
  unsubscribe();
  client.clear();
});

test("Q-4: refetchOnWindowFocus:true — fresh 무시 / stale 재조회", async () => {
  const client = makeClient();
  // QueryClientProvider 가 수행하는 mount — focusManager 구독은 mount 시에만 활성화됨
  client.mount();
  const { fn, stats } = makeCountingFetcher();
  const observer = new QueryObserver(client, {
    ...CREDITS_LIKE,
    queryFn: fn,
    initialData: { balance: 42 },
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  // fresh 상태에서 포커스 → refetch 없음 ("always" 시절과 달라진 지점)
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await tick();
  assert.equal(stats.calls, 0, "staleTime 내 포커스는 refetch 하지 않음");

  // stale 로 강제 (staleTime 0 재설정) 후 포커스 → refetch
  observer.setOptions({
    ...CREDITS_LIKE,
    queryFn: fn,
    staleTime: 0,
  });
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await tick();
  assert.equal(stats.calls, 1, "stale 상태의 포커스는 refetch 해야 함");

  focusManager.setFocused(undefined);
  unsubscribe();
  client.unmount();
  client.clear();
});

test("Q-5: staleTime 경과 후 재구독 → 기본 refetchOnMount(true) 가 재조회", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher();
  const shortStale = {
    queryKey: ["inventory", "char-1"],
    staleTime: 30, // ms — useCharacterInventory(30s)의 축소 모형
    queryFn: fn,
  };

  const first = new QueryObserver(client, {
    ...shortStale,
    initialData: { items: [] },
  });
  const stop1 = first.subscribe(() => {});
  await tick();
  assert.equal(stats.calls, 0, "시드 직후에는 페치 없음");
  stop1();

  await new Promise((r) => setTimeout(r, 50)); // staleTime 경과

  const second = new QueryObserver(client, {
    ...shortStale,
    initialData: { items: [] },
  });
  const stop2 = second.subscribe(() => {});
  await tick();
  assert.equal(
    stats.calls,
    1,
    "stale 해진 캐시는 재마운트에서 기본 refetchOnMount 로 자가 교정",
  );
  stop2();
  client.clear();
});

test("Q-6: RSC 목록 initialData는 마운트 중복 조회 없이 invalidation으로 최신화된다", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher({ pages: ["fresh"] });
  const observer = new QueryObserver(client, {
    ...RSC_LIST_LIKE,
    queryFn: fn,
    initialData: { pages: ["seed"] },
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  assert.equal(stats.calls, 0, "RSC 목록을 마운트 직후 다시 읽지 않아야 함");
  await client.invalidateQueries({ queryKey: ["wiki"] });
  await tick();
  assert.equal(stats.calls, 1, "realtime/mutation invalidation은 즉시 재조회해야 함");
  assert.deepEqual(observer.getCurrentResult().data, { pages: ["fresh"] });

  unsubscribe();
  client.clear();
});

test("Q-7: 검색 RSC seed는 bootstrap 동안 fresh이고 seed가 없으면 즉시 조회한다", async () => {
  const client = makeClient();
  const seeded = makeCountingFetcher({ results: ["fresh"] });
  const seededObserver = new QueryObserver(client, {
    queryKey: ["wiki", "lore-search", "검색어"],
    queryFn: seeded.fn,
    staleTime: 30 * 1000,
    initialData: { results: ["seed"] },
  });
  const stopSeeded = seededObserver.subscribe(() => {});
  await tick();
  assert.equal(seeded.stats.calls, 0);
  stopSeeded();

  const unseeded = makeCountingFetcher({ results: ["live"] });
  const unseededObserver = new QueryObserver(client, {
    queryKey: ["wiki", "lore-search", "다른검색어"],
    queryFn: unseeded.fn,
    staleTime: 0,
  });
  const stopUnseeded = unseededObserver.subscribe(() => {});
  await tick();
  assert.equal(unseeded.stats.calls, 1);

  stopUnseeded();
  client.clear();
});

test("Q-8: 서버 조회 실패 seed는 즉시 stale 처리해 마운트에서 복구한다", async () => {
  const client = makeClient();
  const { fn, stats } = makeCountingFetcher({ pages: ["recovered"] });
  const observer = new QueryObserver(client, {
    ...RSC_LIST_LIKE,
    queryFn: fn,
    initialData: { pages: [] },
    initialDataUpdatedAt: 0,
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  assert.equal(stats.calls, 1);
  assert.deepEqual(observer.getCurrentResult().data, {
    pages: ["recovered"],
  });

  unsubscribe();
  client.clear();
});

test("Q-9: background refetch 실패는 error와 마지막 성공 data를 함께 유지한다", async () => {
  const client = makeClient();
  const observer = new QueryObserver(client, {
    queryKey: ["hall-of-fame", "research"],
    queryFn: async () => {
      throw new Error("temporary refresh failure");
    },
    initialData: { generatedAt: "2026-08-22T12:00:00.000Z", items: ["seed"] },
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
  });
  const unsubscribe = observer.subscribe(() => {});
  await tick();

  const result = observer.getCurrentResult();
  assert.equal(result.isError, true);
  assert.equal(result.isRefetchError, true);
  assert.deepEqual(result.data, {
    generatedAt: "2026-08-22T12:00:00.000Z",
    items: ["seed"],
  });

  unsubscribe();
  client.clear();
});
