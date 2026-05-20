/**
 * Stock market runtime switches.
 *
 * `STOCK_MARKET_ENABLED=0|false|off` disables user buy/sell routes while
 * leaving quote/history reads available.
 */
export function isStockMarketEnabled(): boolean {
  const value = process.env.STOCK_MARKET_ENABLED?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

