/**
 * stocks 관련 re-export 래퍼
 *
 * `@stargate/shared-db`의 주식(stock_prices + stock_holdings + stock_price_history) CRUD를
 * `import "./init"` 사이드이펙트와 함께 re-export 한다.
 *
 * 파일명은 복수형 stocks.ts (도메인이 prices + holdings + history 복합).
 *
 * 신규 호출처는 반드시 이 모듈을 경유해 serverless 초기화 순서를 보장할 것.
 */

import "./init";

export {
  // stock_prices
  getStockPrices,
  getStockPrice,
  ensureStockPrice,
  ensureStockPrices,
  updateStockPrice,
  // stock_holdings
  getHoldings,
  getHoldingsRaw,
  getHolding,
  buyHolding,
  sellHolding,
  getActiveHoldersByTicker,
  getAllHoldings,
  // stock_price_history (M1)
  recordStockPriceHistory,
  listStockPriceHistory,
} from "@stargate/shared-db";

export type {
  StockPrice,
  StockHolding,
  StockPriceHistory,
  CreateStockPriceInput,
  CreateStockHoldingInput,
  CreateStockPriceHistoryInput,
} from "@stargate/shared-db/types";
