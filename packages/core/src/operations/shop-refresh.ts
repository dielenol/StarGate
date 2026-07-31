/**
 * 편의점 일일 재고 자동 리프레시 (tia_bot 의 `refresh_stock` TS 미러).
 *
 * 정책:
 *   - KST `YYYY-MM-DD` 기준 일자 비교. shop_daily_stock.lastRefresh 가 오늘과 다르거나 문서 미존재면 stale.
 *   - 전 재고 1회 조회로 오늘자 품목을 먼저 걸러내고, stale 품목이 없으면 쓰기 없이 즉시 반환 (웜패스 단락).
 *   - 각 item: Math.random() < appearRate 면 stockMax, 아니면 최소 1개 입고.
 *   - stale 품목만 한 번에 처리 (Promise.all 병렬). tia_bot 과 동일.
 *
 * StarGateV2의 stale 재고 방어와 worker의 예약 작업이 같은 operation을 사용한다.
 *
 * Race: DB의 itemId unique + lastRefresh 조건부 갱신으로 품목/일자당 한 호출만 성공.
 * 웜패스 스냅샷이 낡아도 실제 갱신 권한은 여전히 refreshIfStale 의 조건부 갱신이 가진다.
 */

import { getAllDailyStocks, refreshStockIfStale } from "@stargate/shared-db";

import {
  SHOP_CATALOG,
  type ShopCatalogItem,
} from "../domain/shop-catalog.js";
import { rollShopDailyStock } from "../domain/shop-stock.js";

interface DailyStockRefreshDependencies {
  refreshIfStale?: typeof refreshStockIfStale;
  rollStock?: typeof rollShopDailyStock;
  catalog?: readonly ShopCatalogItem[];
  listStocks?: typeof getAllDailyStocks;
}

/**
 * KST 기준 `YYYY-MM-DD` 문자열. `Asia/Seoul` 타임존을 명시해 서버 OS 타임존 의존 회피.
 */
export function getTodayKst(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/**
 * 전체 품목에 대해 stale 체크 후 stale 인 것만 refresh.
 * 호출자에게 `refreshed` 갯수를 반환 — 진단/로그 용도.
 */
export async function ensureDailyStockRefresh(
  now: Date = new Date(),
  dependencies: DailyStockRefreshDependencies = {},
): Promise<{ refreshed: number; today: string }> {
  const today = getTodayKst(now);
  const refreshIfStale =
    dependencies.refreshIfStale ?? refreshStockIfStale;
  const rollStock = dependencies.rollStock ?? rollShopDailyStock;
  const catalog = dependencies.catalog ?? SHOP_CATALOG;
  const listStocks = dependencies.listStocks ?? getAllDailyStocks;

  // 웜패스 단락 — 오늘자 품목은 refreshIfStale 왕복(품목당 최대 3 RTT) 없이 제외.
  const existing = await listStocks();
  const freshItemIds = new Set(
    existing
      .filter((stock) => stock.lastRefresh === today)
      .map((stock) => stock.itemId),
  );
  const staleItems = catalog.filter((item) => !freshItemIds.has(item.slug));
  if (staleItems.length === 0) {
    return { refreshed: 0, today };
  }

  const results = await Promise.all(
    staleItems.map(async (item) => {
      const stock = rollStock(item);
      return refreshIfStale(item.slug, stock, today);
    }),
  );

  return {
    refreshed: results.filter(Boolean).length,
    today,
  };
}
