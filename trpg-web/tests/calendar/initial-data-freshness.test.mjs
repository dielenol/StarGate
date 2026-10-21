import assert from "node:assert/strict";
import test from "node:test";

import { QueryObserver } from "@tanstack/react-query";

import { trpgSessionKeys } from "../../hooks/queries/useTrpgSessions.ts";
import { makeQueryClient } from "../../lib/query/client.ts";

// CalendarClient 는 서버 prefetch 결과를 initialData 로, 그 조회 시각(initialFetchedAt)을 기기 시계로
// 환산한 값을 initialDataUpdatedAt 으로 넘긴다. staleTime(60초)은 그 시각부터 세야 한다 — 마운트 시각이 아니라.

const INITIAL_SESSIONS = [{ id: "s1", date: "2026-10-22" }];

function observeInitialMonth(client, initialDataUpdatedAt) {
  let fetches = 0;
  const observer = new QueryObserver(client, {
    queryKey: trpgSessionKeys.byMonth(2026, 10),
    queryFn: async () => {
      fetches += 1;
      return [];
    },
    initialData: INITIAL_SESSIONS,
    initialDataUpdatedAt,
  });
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe, fetches: () => fetches };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("prefetch 시각이 staleTime 안이면 dataUpdatedAt 은 그 시각이고 마운트 refetch 가 없다", async () => {
  const client = makeQueryClient();
  const fetchedAt = Date.now() - 5_000;

  const { observer, unsubscribe, fetches } = observeInitialMonth(client, fetchedAt);
  await flush();

  assert.equal(observer.getCurrentResult().dataUpdatedAt, fetchedAt);
  assert.deepEqual(observer.getCurrentResult().data, INITIAL_SESSIONS);
  assert.equal(fetches(), 0);
  unsubscribe();
  client.clear();
});

test("prefetch 시각이 staleTime(60초)보다 오래됐으면 마운트 직후 백그라운드 refetch 가 한 번 나간다", async () => {
  const client = makeQueryClient();

  const { observer, unsubscribe, fetches } = observeInitialMonth(client, Date.now() - 61_000);
  await flush();

  assert.equal(fetches(), 1);
  assert.deepEqual(observer.getCurrentResult().data, []);
  unsubscribe();
  client.clear();
});

test("gc 로 지워진 뒤 같은 오래된 initialData 로 다시 시드돼도 신선하게 취급하지 않는다", async () => {
  const client = makeQueryClient();
  const fetchedAt = Date.now() - 10 * 60_000; // 페이지를 띄운 지 10분 — gcTime(5분)도 지남
  const key = trpgSessionKeys.byMonth(2026, 10);

  const first = observeInitialMonth(client, fetchedAt);
  await flush();
  first.unsubscribe();
  client.getQueryCache().remove(client.getQueryCache().find({ queryKey: key }));

  const again = observeInitialMonth(client, fetchedAt);
  await flush();

  assert.equal(again.fetches(), 1);
  again.unsubscribe();
  client.clear();
});
