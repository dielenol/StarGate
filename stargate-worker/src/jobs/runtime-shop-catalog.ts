import {
  mergeRuntimeShopCatalog,
  SHOP_CATALOG,
  type RuntimeShopCatalogItem,
} from "@stargate/core/domain/shop-catalog";
import {
  listMasterItemsByCategories,
  type MasterItem,
} from "@stargate/shared-db";

export async function loadRuntimeShopCatalog(
  dependencies: {
    listItems?: () => Promise<MasterItem[]>;
  } = {},
): Promise<RuntimeShopCatalogItem[]> {
  const items = await (
    dependencies.listItems ??
    (() =>
      listMasterItemsByCategories(["CONSUMABLE"], {
        publicOnly: false,
        availableOnly: false,
      }))
  )();
  return mergeRuntimeShopCatalog(SHOP_CATALOG, items);
}
