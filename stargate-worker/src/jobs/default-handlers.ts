import { grantDailyCreditAllowances } from "@stargate/core/operations/daily-allowance";
import { isMrBeastSodaStockImpactTickEnabled } from "@stargate/core/domain/mrbeast-soda-stock-impact";
import { runSessionReminderNotifications } from "@stargate/core/operations/session-reminders";
import { ensureDailyStockRefresh } from "@stargate/core/operations/shop-refresh";
import {
  applyNovexStockMarketTick,
  applyScheduledStockTick,
  previewNovexStockMarketTick,
  resolveNovexV2Mode,
  rebuildScheduledStockTickSummary,
} from "@stargate/core/operations/stocks-tick";
import { processPendingStockDividendPayouts } from "@stargate/core/operations/stock-dividends";
import { hasActiveStockRightsOffering } from "@stargate/shared-db";

import {
  requestDailyShopRestockState,
  requestStockMarketWireState,
} from "./desired-state.js";
import { ScheduledJobHandlerRegistry } from "./handler-registry.js";
import { loadRuntimeShopCatalog } from "./runtime-shop-catalog.js";

export class ScheduledJobPartialFailureError extends Error {
  constructor(jobName: string, details: Record<string, number | string>) {
    super(
      `${jobName} 부분 실패: ${Object.entries(details)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`,
    );
    this.name = "ScheduledJobPartialFailureError";
  }
}

export class ActiveRightsOfferingModeConflictError extends Error {
  constructor(readonly novexMode: "disabled" | "shadow") {
    super(`ACTIVE_RIGHTS_OFFERING_REQUIRES_NOVEX_ENABLED:${novexMode}`);
    this.name = "ActiveRightsOfferingModeConflictError";
  }
}

function throwIfScheduledJobPartiallyFailed(
  jobName: string,
  failureCount: number,
  details: Record<string, number | string>,
): void {
  if (failureCount <= 0) return;
  throw new ScheduledJobPartialFailureError(jobName, details);
}

/**
 * StarGateV2 서버 모듈을 import하지 않고 runtime-neutral core operation을 실행한다.
 * 외부 Discord 전달은 여기서 하지 않고 desired-state/outbox consumer가 맡는다.
 */
export function createDefaultScheduledJobHandlers(
  dependencies: {
    grantAllowances?: typeof grantDailyCreditAllowances;
    sendSessionReminders?: typeof runSessionReminderNotifications;
    applyNovexTick?: typeof applyNovexStockMarketTick;
    previewNovexTick?: typeof previewNovexStockMarketTick;
    applyLegacyStockTick?: typeof applyScheduledStockTick;
    rebuildStockTickSummary?: typeof rebuildScheduledStockTickSummary;
    processDividendPayouts?: typeof processPendingStockDividendPayouts;
    hasActiveRightsOffering?: typeof hasActiveStockRightsOffering;
    requestStockWire?: typeof requestStockMarketWireState;
  } = {},
): ScheduledJobHandlerRegistry {
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
        const novexMode = resolveNovexV2Mode({
          mode: process.env.NOVEX_V2_MODE,
          legacyEnabled: process.env.NOVEX_V2_ENABLED,
        });
        let shadowPreview:
          | Awaited<ReturnType<typeof previewNovexStockMarketTick>>
          | undefined;
        let shadowError: string | undefined;
        const shadowSlotIsNovex = / (?:09|13|18|23):00$/.test(context.slotKey);
        if (novexMode === "shadow" && shadowSlotIsNovex) {
          try {
            shadowPreview = await (
              dependencies.previewNovexTick ?? previewNovexStockMarketTick
            )({
              now: context.requestedAt,
              slotKey: context.slotKey,
            });
          } catch (error) {
            shadowError = error instanceof Error ? error.message : String(error);
          }
        }
        const runLegacyTick = novexMode === "disabled" || (
          novexMode === "shadow" &&
          (context.slotKey.endsWith("12:00") || context.slotKey.endsWith("13:00"))
        );
        if (
          runLegacyTick &&
          await (
            dependencies.hasActiveRightsOffering ?? hasActiveStockRightsOffering
          )()
        ) {
          throw new ActiveRightsOfferingModeConflictError(novexMode);
        }
        const applied = novexMode === "enabled"
          ? await (dependencies.applyNovexTick ?? applyNovexStockMarketTick)({
              now: context.requestedAt,
              slotKey: context.slotKey,
            })
          : runLegacyTick
            ? await (dependencies.applyLegacyStockTick ?? applyScheduledStockTick)({
                now: context.requestedAt,
                sodaStockImpactEnabled: isMrBeastSodaStockImpactTickEnabled(
                  process.env.MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED,
                ),
              })
            : {
                date: context.slotKey.slice(0, 10),
                slot: context.slotKey,
                results: [],
                skipDiscord: true,
              };
        context.signal.throwIfAborted();
        const result = novexMode === "enabled" || !runLegacyTick
          ? applied
          : (await (
              dependencies.rebuildStockTickSummary ??
              rebuildScheduledStockTickSummary
            )(applied.date)) ?? applied;
        context.signal.throwIfAborted();
        const announcementSlot = novexMode === "enabled"
          ? result.slot.endsWith("23:00")
          : runLegacyTick && result.slot.endsWith("12:00");
        const announcement =
          !result.skipDiscord && announcementSlot
            ? await (dependencies.requestStockWire ?? requestStockMarketWireState)(
                result,
                context.requestedAt,
              )
            : false;
        const dividends = novexMode === "enabled"
          ? await (dependencies.processDividendPayouts ?? processPendingStockDividendPayouts)()
          : { paid: 0, totalAmount: 0, errors: 0, drained: true };
        const dividendErrors = dividends.errors ?? 0;
        context.signal.throwIfAborted();
        throwIfScheduledJobPartiallyFailed(
          "stocks.tick",
          (dividends.drained ? 0 : 1) + dividendErrors,
          {
            dividendErrors,
            dividendQueueRemaining: dividends.drained ? 0 : 1,
          },
        );
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
          dividendsPaid: dividends.paid,
          dividendsAmount: dividends.totalAmount,
          dividendErrors,
          ...(result.warning ? { warning: result.warning } : {}),
          ...(shadowPreview
            ? {
                shadowSlot: shadowPreview.slot,
                shadowUpdated: shadowPreview.results.filter(
                  (item) => item.status === "updated",
                ).length,
                shadowResultsJson: JSON.stringify(shadowPreview.results),
                ...(shadowPreview.shadowState
                  ? { shadowStateJson: JSON.stringify(shadowPreview.shadowState) }
                  : {}),
                shadowComparisonJson: JSON.stringify(
                  shadowPreview.results.map((shadow) => {
                    const legacy = result.results.find(
                      (item) => item.ticker === shadow.ticker,
                    );
                    const baseline = shadowPreview.shadowComparison?.find(
                      (item) => item.ticker === shadow.ticker,
                    );
                    const legacyPrice = legacy?.price ?? baseline?.legacyPrice ?? null;
                    return {
                      ticker: shadow.ticker,
                      shadowPrice: shadow.price,
                      legacyPrice,
                      deltaPercent: legacyPrice && legacyPrice > 0
                        ? ((shadow.price - legacyPrice) / legacyPrice) * 100
                        : null,
                    };
                  }),
                ),
              }
            : {}),
          ...(shadowError ? { shadowError } : {}),
          novexMode,
          mutated:
            result.marketStateChanged === true || updated + initialized > 0,
        };
      },
    },
    {
      jobName: "credits.daily-allowance",
      async execute(context) {
        context.signal.throwIfAborted();
        const result = await (
          dependencies.grantAllowances ?? grantDailyCreditAllowances
        )(context.requestedAt);
        context.signal.throwIfAborted();
        throwIfScheduledJobPartiallyFailed(
          "credits.daily-allowance",
          result.failed + result.notificationsFailed,
          {
            date: result.date,
            failed: result.failed,
            notificationsFailed: result.notificationsFailed,
          },
        );
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
        const result = await (
          dependencies.sendSessionReminders ??
          runSessionReminderNotifications
        )(context.requestedAt);
        context.signal.throwIfAborted();
        const failed = result.registra.failed + result.trpg.failed;
        throwIfScheduledJobPartiallyFailed(
          "sessions.erp-reminders",
          failed,
          {
            windowStart: result.now,
            failed,
          },
        );
        return {
          windowStart: result.now,
          windowEnd: result.windowEnd,
          candidates:
            result.registra.candidates + result.trpg.candidates,
          notifications:
            result.registra.notifications + result.trpg.notifications,
          failed,
          mutated:
            result.registra.notifications + result.trpg.notifications > 0,
        };
      },
    },
  ]);
}
