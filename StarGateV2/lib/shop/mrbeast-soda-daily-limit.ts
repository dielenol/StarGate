import { kstDateTag } from "@stargate/core/domain/kst-time";

export const MRBEAST_SODA_DAILY_PURCHASE_LIMIT = 10;
export const MRBEAST_SODA_DAILY_LIMIT_ERROR_CODE =
  "MRBEAST_SODA_DAILY_LIMIT_EXCEEDED";
export const MRBEAST_SODA_DAILY_LIMIT_ERROR_MESSAGE =
  "미스터비스트 소다는 한국시간 기준 하루 최대 10개까지 구매할 수 있습니다.";

export interface MrBeastSodaDailyPurchaseKey {
  userId: string;
  slug: string;
  kstDate: string;
}

export function createMrBeastSodaDailyPurchaseKey(input: {
  userId: string;
  slug: string;
  purchasedAt?: Date;
}): MrBeastSodaDailyPurchaseKey {
  if (!input.userId.trim() || !input.slug.trim()) {
    throw new Error("MrBeast soda daily purchase key requires userId and slug");
  }
  return {
    userId: input.userId,
    slug: input.slug,
    kstDate: kstDateTag(input.purchasedAt ?? new Date()),
  };
}

export function isMrBeastSodaDailyPurchaseAllowed(
  purchasedQuantity: number,
  requestedQuantity: number,
): boolean {
  return (
    Number.isSafeInteger(purchasedQuantity) &&
    purchasedQuantity >= 0 &&
    Number.isSafeInteger(requestedQuantity) &&
    requestedQuantity >= 1 &&
    purchasedQuantity + requestedQuantity <=
      MRBEAST_SODA_DAILY_PURCHASE_LIMIT
  );
}

export class MrBeastSodaDailyLimitError extends Error {
  readonly code = MRBEAST_SODA_DAILY_LIMIT_ERROR_CODE;

  constructor() {
    super(MRBEAST_SODA_DAILY_LIMIT_ERROR_MESSAGE);
    this.name = "MrBeastSodaDailyLimitError";
  }
}
