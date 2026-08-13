import { MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION } from "./mrbeast-lottery.ts";

export const MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID =
  "mrbeast-soda-apology-payback-v1";
export const MRBEAST_SODA_APOLOGY_PAYBACK_PURCHASE_UNIT = 10;
export const MRBEAST_SODA_APOLOGY_PAYBACK_TICKETS_PER_UNIT = 3;
export const MRBEAST_SODA_APOLOGY_PAYBACK_START_KST_DATE = "2026-07-31";
export const MRBEAST_SODA_APOLOGY_PAYBACK_END_KST_DATE = "2026-08-13";

export interface MrBeastSodaApologyPaybackCalculation {
  purchasedQuantity: number;
  rewardQuantity: number;
}

/**
 * 누적 소다 10개 단위마다 사죄 복권 3장을 지급한다.
 * 10개 미만의 나머지는 이번 일회성 보상에서 이월하지 않는다.
 */
export function calculateMrBeastSodaApologyPayback(
  purchasedQuantity: number,
): MrBeastSodaApologyPaybackCalculation {
  if (
    !Number.isSafeInteger(purchasedQuantity) ||
    purchasedQuantity < 0
  ) {
    throw new RangeError("Purchased soda quantity must be a safe non-negative integer");
  }

  const rewardQuantity =
    Math.floor(
      purchasedQuantity / MRBEAST_SODA_APOLOGY_PAYBACK_PURCHASE_UNIT,
    ) * MRBEAST_SODA_APOLOGY_PAYBACK_TICKETS_PER_UNIT;
  if (!Number.isSafeInteger(rewardQuantity)) {
    throw new RangeError("Apology lottery reward quantity exceeds safe integer range");
  }

  return { purchasedQuantity, rewardQuantity };
}

export function isMrBeastSodaApologyPaybackDateEligible(
  kstDate: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kstDate)) return false;
  const [year, month, day] = kstDate.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate =
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day;
  return (
    isCalendarDate &&
    kstDate >= MRBEAST_SODA_APOLOGY_PAYBACK_START_KST_DATE &&
    kstDate <= MRBEAST_SODA_APOLOGY_PAYBACK_END_KST_DATE
  );
}

export const MRBEAST_SODA_APOLOGY_PAYBACK_PRIZE_TABLE_VERSION =
  MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION;
