import { grantDailyCreditAllowances } from "@stargate/core/operations/daily-allowance";
import { runSessionReminderNotifications } from "@stargate/core/operations/session-reminders";
import { ensureDailyStockRefresh } from "@stargate/core/operations/shop-refresh";
import {
  applyScheduledStockTick,
  rebuildScheduledStockTickSummary,
} from "@stargate/core/operations/stocks-tick";

import {
  requestDailyShopRestockState,
  requestStockMarketWireState,
} from "./desired-state.js";
import { ScheduledJobHandlerRegistry } from "./handler-registry.js";
import { loadRuntimeShopCatalog } from "./runtime-shop-catalog.js";

/**
 * StarGateV2 서버 모듈을 import하지 않고 runtime-neutral core operation을 실행한다.
 * 외부 Discord 전달은 여기서 하지 않고 desired-state/outbox consumer가 맡는다.
 */
export function createDefaultScheduledJobHandlers(): ScheduledJobHandlerRegistry {
  return new ScheduledJobHandlerRegistry([
    {
      jobName: "shop.refresh",
      async execute(context) {
        context.signal.throwIfAborted();
        const catalog = await loadRuntimeShopCatalog();
        const result = await ensureDailyStockRefresh(context.requestedAt, {
          catalog,
        });
        context.signal.throwIfAborted();
        const announcement = await requestDailyShopRestockState(
          result.today,
          context.requestedAt,
          catalog,
        );
        context.signal.throwIfAborted();
        return {
          date: result.today,
          refreshed: result.refreshed,
          announcement,
          mutated: result.refreshed > 0,
        };
      },
    },
    {
      jobName: "stocks.tick",
      async execute(context) {
        context.signal.throwIfAborted();
        const applied = await applyScheduledStockTick({
          now: context.requestedAt,
        });
        context.signal.throwIfAborted();
        const result =
          (await rebuildScheduledStockTickSummary(applied.date)) ??
          applied;
        context.signal.throwIfAborted();
        const announcement = await requestStockMarketWireState(
          result,
          context.requestedAt,
        );
        context.signal.throwIfAborted();
        const updated = result.results.filter(
          (item) => item.status === "updated",
        ).length;
        const initialized = result.results.filter(
          (item) => item.status === "initialized",
        ).length;
        return {
          date: result.date,
          slot: result.slot,
          updated,
          initialized,
          skipped: result.results.length - updated - initialized,
          announcement,
          mutated: updated + initialized > 0,
        };
      },
    },
    {
      jobName: "credits.daily-allowance",
      async execute(context) {
        context.signal.throwIfAborted();
        const result = await grantDailyCreditAllowances(
          context.requestedAt,
        );
        context.signal.throwIfAborted();
        return {
          date: result.date,
          candidates: result.totalCandidates,
          granted: result.granted,
          skipped: result.skipped,
          failed: result.failed,
          notificationsSent: result.notificationsSent,
          notificationsFailed: result.notificationsFailed,
          totalAmount: result.totalAmount,
          mutated: result.granted > 0,
        };
      },
    },
    {
      jobName: "sessions.erp-reminders",
      async execute(context) {
        context.signal.throwIfAborted();
        const result = await runSessionReminderNotifications(
          context.requestedAt,
        );
        context.signal.throwIfAborted();
        return {
          windowStart: result.now,
          windowEnd: result.windowEnd,
          candidates:
            result.registra.candidates + result.trpg.candidates,
          notifications:
            result.registra.notifications + result.trpg.notifications,
          failed: result.registra.failed + result.trpg.failed,
          mutated:
            result.registra.notifications + result.trpg.notifications > 0,
        };
      },
    },
  ]);
}
