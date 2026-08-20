import {
  applyNovexStockMarketTick,
  resolveNovexV2Mode,
} from "@stargate/core/operations/stocks-tick";
import type { IntegrationOutboxEvent } from "@stargate/shared-db";

import { requestStockMarketWireState } from "../jobs/desired-state.js";
import type { IntegrationOutboxDeliveryHandler } from "./port.js";

const SLOT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2} (?:09|13|18|23):00$/;

interface StockMarketRecoveryHandlerDependencies {
  applyTick?: typeof applyNovexStockMarketTick;
  requestWire?: typeof requestStockMarketWireState;
  now?: () => Date;
  mode?: () => "disabled" | "shadow" | "enabled";
}

function recoverySlotKey(event: IntegrationOutboxEvent): string {
  const value = event.payload.slotKey;
  if (typeof value !== "string" || !SLOT_KEY_PATTERN.test(value)) {
    throw new Error("STOCK_MARKET_RECOVERY_REQUEST slotKey가 올바르지 않습니다.");
  }
  return value;
}

/** API가 durable outbox에 접수한 GM 복구 요청을 worker가 단독 실행한다. */
export function createStockMarketRecoveryOutboxHandler(
  dependencies: StockMarketRecoveryHandlerDependencies = {},
): IntegrationOutboxDeliveryHandler {
  return {
    kind: "STOCK_MARKET_RECOVERY_REQUEST",
    async deliver(event) {
      const mode = dependencies.mode?.() ?? resolveNovexV2Mode({
        mode: process.env.NOVEX_V2_MODE,
        legacyEnabled: process.env.NOVEX_V2_ENABLED,
      });
      if (mode !== "enabled") {
        throw new Error("NOVEX enabled 모드에서만 지연 회차를 복구할 수 있습니다.");
      }
      const slotKey = recoverySlotKey(event);
      const now = dependencies.now?.() ?? new Date();
      const summary = await (
        dependencies.applyTick ?? applyNovexStockMarketTick
      )({ slotKey, now });
      if (!summary.skipDiscord) {
        await (dependencies.requestWire ?? requestStockMarketWireState)(
          summary,
          now,
        );
      }
      return { outcome: "SENT" };
    },
  };
}
