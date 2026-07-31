/**
 * Validator 검증 — S1 편의점 재고 리프레시 웜패스 단락 (Phase 1 성능 최적화)
 *
 * 검증 대상: packages/core/src/operations/shop-refresh.ts (ensureDailyStockRefresh)
 *   — StarGateV2 래퍼(lib/shop/refresh-stock.ts) 경유로 built dist 를 실행한다.
 *
 * 시나리오:
 *   W-1: 전 품목 fresh → refreshed 0 + refreshIfStale 미호출 (쓰기 없는 웜패스)
 *   W-2: 일부 stale → stale 품목만 refreshIfStale fan-out
 *   W-3: 스냅샷 부재 품목(문서 미존재) → stale 취급
 *   W-4: 스냅샷은 stale 인데 fan-out 직전 동시 갱신 완료 → 조건부 갱신(false)이
 *        최종 방어 — refreshed 0, 이중 갱신 없음
 *   W-5: KST 자정 경계 — UTC 14:59:59.999 는 전날, 15:00:00 은 익일로 판정
 *   W-6: 카탈로그 밖 itemId 가 스냅샷에 섞여도 무시 (crash 없음)
 *   W-7: listStocks 자체가 실패하면 에러 전파 (silent-skip 금지)
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/shop/__tests__/refresh-stock-warm-path.test.mjs
 */

import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const originalMongoUri = process.env.MONGODB_URI;
process.env.MONGODB_URI =
  originalMongoUri ?? "mongodb://127.0.0.1:27017/stargate-test";
const { ensureDailyStockRefresh } = await import("../refresh-stock.ts");
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

/** 고정 시각: 2026-07-27T02:00:00Z = KST 2026-07-27 11:00 → today "2026-07-27" */
const NOW = new Date("2026-07-27T02:00:00.000Z");
const TODAY = "2026-07-27";

const CATALOG = [
  { slug: "item-a" },
  { slug: "item-b" },
  { slug: "item-c" },
];

function makeTrackedRefreshIfStale({ result = true } = {}) {
  const calls = [];
  const fn = async (itemId, stock, today) => {
    calls.push({ itemId, stock, today });
    await Promise.resolve();
    return typeof result === "function" ? result(itemId) : result;
  };
  return { fn, calls };
}

test("W-1: 전 품목 fresh → refreshed 0 + refreshIfStale 미호출", async () => {
  const { fn: refreshIfStale, calls } = makeTrackedRefreshIfStale();
  let listCalls = 0;
  const summary = await ensureDailyStockRefresh(NOW, {
    refreshIfStale,
    rollStock: () => 1,
    catalog: CATALOG,
    listStocks: async () => {
      listCalls += 1;
      return CATALOG.map(({ slug }) => ({
        itemId: slug,
        stock: 3,
        lastRefresh: TODAY,
      }));
    },
  });

  assert.deepEqual(summary, { refreshed: 0, today: TODAY });
  assert.equal(calls.length, 0, "웜패스에서 refreshIfStale 왕복이 없어야 함");
  assert.equal(listCalls, 1, "선조회는 정확히 1회");
});

test("W-2: 일부 stale → 해당 품목만 fan-out", async () => {
  const { fn: refreshIfStale, calls } = makeTrackedRefreshIfStale();
  const summary = await ensureDailyStockRefresh(NOW, {
    refreshIfStale,
    rollStock: () => 5,
    catalog: CATALOG,
    listStocks: async () => [
      { itemId: "item-a", stock: 3, lastRefresh: TODAY }, // fresh
      { itemId: "item-b", stock: 0, lastRefresh: "2026-07-26" }, // stale
      // item-c: 문서 미존재 → stale
    ],
  });

  assert.equal(summary.refreshed, 2);
  assert.deepEqual(
    calls.map((c) => c.itemId).sort(),
    ["item-b", "item-c"],
    "fresh 품목(item-a)은 refreshIfStale 대상에서 제외",
  );
  for (const call of calls) {
    assert.equal(call.today, TODAY);
    assert.equal(call.stock, 5);
  }
});

test("W-3: 스냅샷 전부 부재(초기 상태) → 전 품목 fan-out", async () => {
  const { fn: refreshIfStale, calls } = makeTrackedRefreshIfStale();
  const summary = await ensureDailyStockRefresh(NOW, {
    refreshIfStale,
    rollStock: () => 1,
    catalog: CATALOG,
    listStocks: async () => [],
  });
  assert.equal(summary.refreshed, CATALOG.length);
  assert.equal(calls.length, CATALOG.length);
});

test("W-4: 스냅샷 stale + 동시 갱신 선점 → 조건부 갱신이 최종 방어 (이중 갱신 0)", async () => {
  // 스냅샷은 어제로 낡아 있지만, fan-out 시점에는 다른 인스턴스가 이미 갱신 완료
  // → refreshIfStale(DB 조건부 갱신 모사)가 false 반환 → refreshed 0.
  const { fn: refreshIfStale, calls } = makeTrackedRefreshIfStale({
    result: false,
  });
  const summary = await ensureDailyStockRefresh(NOW, {
    refreshIfStale,
    rollStock: () => 1,
    catalog: CATALOG,
    listStocks: async () =>
      CATALOG.map(({ slug }) => ({
        itemId: slug,
        stock: 1,
        lastRefresh: "2026-07-26",
      })),
  });
  assert.equal(summary.refreshed, 0, "조건부 갱신 패배는 refreshed 에 미집계");
  assert.equal(calls.length, CATALOG.length, "시도 자체는 stale 판정대로 수행");
});

test("W-5: KST 자정 경계 — 15:00Z 롤오버 전후 스냅샷 판정", async () => {
  // 2026-07-27T14:59:59.999Z = KST 07-27 23:59:59.999 → today "2026-07-27" → fresh
  const before = await ensureDailyStockRefresh(
    new Date("2026-07-27T14:59:59.999Z"),
    {
      refreshIfStale: async () => true,
      rollStock: () => 1,
      catalog: CATALOG,
      listStocks: async () =>
        CATALOG.map(({ slug }) => ({
          itemId: slug,
          stock: 1,
          lastRefresh: "2026-07-27",
        })),
    },
  );
  assert.deepEqual(before, { refreshed: 0, today: "2026-07-27" });

  // 2026-07-27T15:00:00.000Z = KST 07-28 00:00 → today "2026-07-28" → 전 품목 stale
  const after = await ensureDailyStockRefresh(
    new Date("2026-07-27T15:00:00.000Z"),
    {
      refreshIfStale: async () => true,
      rollStock: () => 1,
      catalog: CATALOG,
      listStocks: async () =>
        CATALOG.map(({ slug }) => ({
          itemId: slug,
          stock: 1,
          lastRefresh: "2026-07-27",
        })),
    },
  );
  assert.deepEqual(after, { refreshed: CATALOG.length, today: "2026-07-28" });
});

test("W-6: 카탈로그 밖 itemId 스냅샷 행은 무시", async () => {
  const { fn: refreshIfStale, calls } = makeTrackedRefreshIfStale();
  const summary = await ensureDailyStockRefresh(NOW, {
    refreshIfStale,
    rollStock: () => 1,
    catalog: CATALOG,
    listStocks: async () => [
      { itemId: "retired-item", stock: 9, lastRefresh: TODAY },
      ...CATALOG.map(({ slug }) => ({
        itemId: slug,
        stock: 1,
        lastRefresh: TODAY,
      })),
    ],
  });
  assert.deepEqual(summary, { refreshed: 0, today: TODAY });
  assert.equal(calls.length, 0);
});

test("W-7: listStocks 실패는 전파 (조용한 skip 금지)", async () => {
  await assert.rejects(
    ensureDailyStockRefresh(NOW, {
      refreshIfStale: async () => true,
      rollStock: () => 1,
      catalog: CATALOG,
      listStocks: async () => {
        throw new Error("snapshot query down");
      },
    }),
    /snapshot query down/,
  );
});
