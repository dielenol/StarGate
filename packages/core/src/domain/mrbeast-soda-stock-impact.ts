export const MRBEAST_SODA_STOCK_IMPACT_PROMOTION =
  "mrbeast-soda-stm-v1" as const;
export const MRBEAST_SODA_STOCK_IMPACT_TICKER = "STM" as const;
export const MRBEAST_SODA_STOCK_IMPACT_DURATION_MS =
  14 * 24 * 60 * 60 * 1_000;
export const MRBEAST_SODA_STOCK_IMPACT_PER_UNIT = 0.001;
export const MRBEAST_SODA_STOCK_IMPACT_DAILY_CAP = 0.05;

export function isMrBeastSodaStockImpactTickEnabled(
  value: string | undefined,
): boolean {
  return value === "1" || value?.trim().toLowerCase() === "true";
}

export interface MrBeastSodaStockImpactWindow {
  promotion: typeof MRBEAST_SODA_STOCK_IMPACT_PROMOTION;
  ticker: typeof MRBEAST_SODA_STOCK_IMPACT_TICKER;
  eventId: string;
  configVersion: number;
  startAt: Date;
  endAt: Date;
}

export function resolveMrBeastSodaStockImpactWindow(input: {
  eventId: string | null;
  configVersion: number;
  startAt: Date | null;
  endAt: Date | null;
}): MrBeastSodaStockImpactWindow | null {
  if (
    !input.eventId ||
    !Number.isSafeInteger(input.configVersion) ||
    input.configVersion < 1 ||
    !(input.startAt instanceof Date) ||
    Number.isNaN(input.startAt.getTime()) ||
    !(input.endAt instanceof Date) ||
    Number.isNaN(input.endAt.getTime()) ||
    input.startAt.getTime() >= input.endAt.getTime()
  ) {
    return null;
  }
  const boundedEndAt = new Date(
    Math.min(
      input.endAt.getTime(),
      input.startAt.getTime() + MRBEAST_SODA_STOCK_IMPACT_DURATION_MS,
    ),
  );
  return {
    promotion: MRBEAST_SODA_STOCK_IMPACT_PROMOTION,
    ticker: MRBEAST_SODA_STOCK_IMPACT_TICKER,
    eventId: input.eventId,
    configVersion: input.configVersion,
    startAt: new Date(input.startAt),
    endAt: boundedEndAt,
  };
}

export function isMrBeastSodaStockImpactPurchaseEligible(
  window: MrBeastSodaStockImpactWindow,
  purchasedAt: Date,
): boolean {
  const timestamp = purchasedAt.getTime();
  return (
    !Number.isNaN(timestamp) &&
    timestamp >= window.startAt.getTime() &&
    timestamp < window.endAt.getTime()
  );
}

export function calculateMrBeastSodaStockImpactPercent(
  soldQuantity: number,
): number {
  if (!Number.isSafeInteger(soldQuantity) || soldQuantity <= 0) return 0;
  const percent = Math.min(
    MRBEAST_SODA_STOCK_IMPACT_DAILY_CAP,
    soldQuantity * MRBEAST_SODA_STOCK_IMPACT_PER_UNIT,
  );
  return Math.round(percent * 1_000) / 1_000;
}
