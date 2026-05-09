/**
 * shop 관련 re-export 래퍼
 *
 * `@stargate/shared-db`의 편의점(shop_inventory + shop_daily_stock) CRUD를
 * `import "./init"` 사이드이펙트와 함께 re-export 한다.
 *
 * 신규 호출처는 반드시 이 모듈을 경유해 serverless 초기화 순서를 보장할 것.
 */

import "./init";

export {
  // shop_inventory
  getUserInventory,
  getUserInventoryRaw,
  addInventory,
  removeInventory,
  // shop_daily_stock
  needsRefresh,
  refreshStock,
  ensureStockEntry,
  getStock,
  reduceStock,
  restoreStock,
  getAllDailyStocks,
} from "@stargate/shared-db";

export type {
  ShopInventory,
  ShopDailyStock,
  CreateShopInventoryInput,
  CreateShopDailyStockInput,
} from "@stargate/shared-db/types";
