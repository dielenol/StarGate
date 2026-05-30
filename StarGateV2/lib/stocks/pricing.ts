export const STOCK_PRICE_DECIMALS = 2;
export const STOCK_PRICE_SCALE = 10 ** STOCK_PRICE_DECIMALS;
export const MIN_STOCK_PRICE = 0.01;
export const MAX_STOCK_PRICE = 999_999_999;

export function roundStockValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * STOCK_PRICE_SCALE) / STOCK_PRICE_SCALE;
}

export function normalizeStockPrice(value: number): number {
  return Math.min(
    MAX_STOCK_PRICE,
    Math.max(MIN_STOCK_PRICE, roundStockValue(value)),
  );
}

export function isValidStockPrice(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_STOCK_PRICE &&
    value <= MAX_STOCK_PRICE
  );
}

export function formatStockValue(value: number): string {
  const rounded = roundStockValue(value);
  const hasFraction = !Number.isInteger(rounded);
  return rounded.toLocaleString("ko-KR", {
    minimumFractionDigits: hasFraction ? STOCK_PRICE_DECIMALS : 0,
    maximumFractionDigits: STOCK_PRICE_DECIMALS,
  });
}

export function formatSignedStockValue(value: number, suffix = ""): string {
  const rounded = roundStockValue(value);
  if (rounded === 0) return `0${suffix}`;
  return `${rounded > 0 ? "+" : ""}${formatStockValue(rounded)}${suffix}`;
}
