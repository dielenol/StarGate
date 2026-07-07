import type { ShopCatalogItem } from "./catalog";

const MIN_GUARANTEED_DAILY_STOCK = 1;

type StockRollItem = Pick<
  ShopCatalogItem,
  "stockMin" | "stockMax" | "appearRate"
>;

export function getGuaranteedDailyStock(item: StockRollItem): number {
  return Math.max(
    MIN_GUARANTEED_DAILY_STOCK,
    Math.min(item.stockMin, item.stockMax),
  );
}

/**
 * 일일 편의점 재고 산정.
 * - 낮은 확률 품목도 최소 1개는 입고한다.
 * - appearRate 는 stockMax 로 입고될 확률로 사용한다.
 */
export function rollShopDailyStock(
  item: StockRollItem,
  random: () => number = Math.random,
): number {
  const guaranteedStock = getGuaranteedDailyStock(item);
  if (random() < item.appearRate) {
    return Math.max(guaranteedStock, item.stockMax);
  }
  return guaranteedStock;
}
