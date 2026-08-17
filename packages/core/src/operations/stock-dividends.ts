import { payNextPendingStockDividendEntitlement } from "@stargate/shared-db";

export interface StockDividendPayoutSummary {
  paid: number;
  totalAmount: number;
  errors: number;
  drained: boolean;
}

/** entitlement별 독립 transaction으로 지급해 부분 실패 후 안전하게 재시도한다. */
export async function processPendingStockDividendPayouts(
  limit = 100,
  dependencies: {
    payNext?: typeof payNextPendingStockDividendEntitlement;
  } = {},
): Promise<StockDividendPayoutSummary> {
  let paid = 0;
  let totalAmount = 0;
  let errors = 0;
  const failedEntitlementIds = new Set<string>();
  for (let processed = 0; processed < limit; processed += 1) {
    const result = await (
      dependencies.payNext ?? payNextPendingStockDividendEntitlement
    )({ excludeEntitlementIds: [...failedEntitlementIds] });
    if (result.status === "EMPTY") {
      return { paid, totalAmount, errors, drained: errors === 0 };
    }
    if (result.status === "ERROR") {
      errors += 1;
      failedEntitlementIds.add(result.entitlementId);
      continue;
    }
    paid += 1;
    totalAmount += result.amount;
  }
  return { paid, totalAmount, errors, drained: false };
}
