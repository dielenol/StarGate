/**
 * 편의점 일일 재고 자동 리프레시 (tia_bot 의 `refresh_stock` TS 미러).
 *
 * 정책:
 *   - KST `YYYY-MM-DD` 기준 일자 비교. shop_daily_stock.lastRefresh 가 오늘과 다르거나 문서 미존재면 stale.
 *   - 각 item: Math.random() < appearRate 면 stockMax, 아니면 최소 1개 입고.
 *   - SHOP_CATALOG 의 모든 품목을 한 번에 처리 (Promise.all 병렬). tia_bot 과 동일.
 *
 * 호출 지점:
 *   - `app/api/cron/shop/refresh/route.ts` — 일일 스케줄 갱신.
 *   - 구매/체크아웃 같은 쓰기 경로 — cron 누락 시 stale 재고 방어.
 *
 * Race: 동시 호출 시 두 번 refresh 가능 — 마지막 write 가 이김. tia_bot 동작과 동일.
 */

import "@/lib/db/init";

import {
  getAllDailyStocks,
  refreshStock,
} from "@stargate/shared-db";

import { SHOP_CATALOG } from "./catalog";
import { rollShopDailyStock } from "./stock-roll";

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
): Promise<{ refreshed: number; today: string }> {
  const today = getTodayKst(now);
  const currentStocks = await getAllDailyStocks();
  const currentStockBySlug = new Map(
    currentStocks.map((stock) => [stock.itemId, stock]),
  );

  const results = await Promise.all(
    SHOP_CATALOG.map(async (item) => {
      const current = currentStockBySlug.get(item.slug);
      if (current?.lastRefresh === today) return false;
      const stock = rollShopDailyStock(item);
      await refreshStock(item.slug, stock, today);
      return true;
    }),
  );

  return {
    refreshed: results.filter(Boolean).length,
    today,
  };
}
