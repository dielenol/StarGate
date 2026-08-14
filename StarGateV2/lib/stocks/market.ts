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

export type NovexV2Mode = "disabled" | "shadow" | "enabled";

/**
 * NOVEX 2.0 전환 모드.
 *
 * - disabled: 기존 엔진만 사용.
 * - shadow: 신규 산식은 비교 계산만 하고 거래/시세 SSOT는 기존 엔진 유지.
 * - enabled: 신규 시장 상태·회차 엔진을 거래 SSOT로 사용.
 */
export function getNovexV2Mode(): NovexV2Mode {
  const value = process.env.NOVEX_V2_MODE?.trim().toLowerCase();
  if (value === "enabled" || value === "on" || value === "1") {
    return "enabled";
  }
  if (value === "shadow") return "shadow";
  if (process.env.NOVEX_V2_ENABLED?.trim().toLowerCase() === "true") {
    return "enabled";
  }
  return "disabled";
}

export function isNovexV2Enabled(): boolean {
  return getNovexV2Mode() === "enabled";
}
