/**
 * 호환 진입점. 신규 자산 코드는 `lib/assets/{shop,catalog}.ts`를 사용한다.
 */
export {
  getShopItemImageSrc,
  SHOP_ITEM_IMAGE_BASE_PATH,
  SHOP_ITEM_IMAGE_BY_SLUG,
} from "../assets/shop.ts";
export {
  CATALOG_ITEM_IMAGE_BY_SLUG,
  CONSUMABLE_ITEM_IMAGE_BY_SLUG,
  getCatalogItemImageSrc,
  getConsumableItemImageSrc,
} from "../assets/catalog.ts";
