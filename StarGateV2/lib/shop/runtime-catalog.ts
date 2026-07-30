import {
  mergeRuntimeShopCatalog,
  SHOP_CATALOG,
  toRuntimeShopCatalogItem,
  type RuntimeShopCatalogItem,
} from "@stargate/core/domain/shop-catalog";

import type { MasterItem } from "@stargate/shared-db";

import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";

export {
  mergeRuntimeShopCatalog,
  toRuntimeShopCatalogItem,
};
export type { RuntimeShopCatalogItem };

export async function loadRuntimeShopCatalog(
  dependencies: {
    listItems?: () => Promise<MasterItem[]>;
  } = {},
): Promise<RuntimeShopCatalogItem[]> {
  const items = await (
    dependencies.listItems ??
    (() =>
      listMasterItemsByCategoryFilter(["CONSUMABLE"], {
        publicOnly: false,
        availableOnly: false,
      }))
  )();
  return mergeRuntimeShopCatalog(SHOP_CATALOG, items);
}

export async function findRuntimeShopItemBySlug(
  slug: string,
  dependencies: Parameters<typeof loadRuntimeShopCatalog>[0] = {},
): Promise<RuntimeShopCatalogItem | undefined> {
  const catalog = await loadRuntimeShopCatalog(dependencies);
  return catalog.find((item) => item.slug === slug);
}
