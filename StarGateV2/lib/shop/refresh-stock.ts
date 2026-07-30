import "@/lib/db/init";

import {
  ensureDailyStockRefresh as ensureCoreDailyStockRefresh,
  getTodayKst,
} from "@stargate/core/operations/shop-refresh";
import { loadRuntimeShopCatalog } from "./runtime-catalog";

export { getTodayKst };
export * from "@stargate/core/domain/shop-stock";

type DailyStockRefreshDependencies = Parameters<
  typeof ensureCoreDailyStockRefresh
>[1];

export async function ensureDailyStockRefresh(
  now: Date = new Date(),
  dependencies: DailyStockRefreshDependencies = {},
): Promise<{ refreshed: number; today: string }> {
  const catalog =
    dependencies.catalog ?? (await loadRuntimeShopCatalog());
  return ensureCoreDailyStockRefresh(now, {
    ...dependencies,
    catalog,
  });
}
