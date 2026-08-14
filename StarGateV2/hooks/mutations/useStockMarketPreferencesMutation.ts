import { useEffect, useRef } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  parseStockMarketPreferencesError,
  type StockMarketAlertRule,
  type StockMarketPreferenceResponse,
  StockMarketPreferencesApiError,
  stockMarketPreferenceKeys,
  useStockMarketPreferences,
} from "@/hooks/queries/useStockMarketPreferencesQuery";

const LEGACY_WATCHLIST_KEY = "stargate.stock.watchlist";
const LEGACY_ALERTS_KEY = "stargate.stock.alert-rules";

interface LegacyStockMarketPreference {
  watchlist: string[];
  alerts: StockMarketAlertRule[];
}

export interface UpdateStockMarketPreferencesInput {
  operationId: string;
  watchlist?: string[];
  alerts?: StockMarketAlertRule[];
  legacy?: LegacyStockMarketPreference;
}

function readJsonStorage(key: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return ticker.length > 0 ? ticker : null;
}

function legacyAlertId(ticker: string, kind: StockMarketAlertRule["kind"]): string {
  return `legacy:${ticker}:${kind.toLowerCase()}`;
}

function readLegacyStockMarketPreference(): LegacyStockMarketPreference {
  const watchlistRaw = readJsonStorage(LEGACY_WATCHLIST_KEY);
  const watchlist = Array.isArray(watchlistRaw)
    ? Array.from(
        new Set(watchlistRaw.map(normalizeTicker).filter((item): item is string => item !== null)),
      ).sort()
    : [];

  const alertsRaw = readJsonStorage(LEGACY_ALERTS_KEY);
  const alerts: StockMarketAlertRule[] = [];
  if (alertsRaw && typeof alertsRaw === "object" && !Array.isArray(alertsRaw)) {
    for (const [rawTicker, rawRule] of Object.entries(alertsRaw)) {
      const ticker = normalizeTicker(rawTicker);
      if (!ticker || !rawRule || typeof rawRule !== "object") continue;
      const rule = rawRule as Record<string, unknown>;
      if (typeof rule.belowPrice === "number" && rule.belowPrice > 0) {
        alerts.push({
          id: legacyAlertId(ticker, "BELOW_PRICE"),
          ticker,
          kind: "BELOW_PRICE",
          threshold: rule.belowPrice,
          enabled: true,
        });
      }
      if (typeof rule.movePercent === "number" && rule.movePercent > 0) {
        alerts.push({
          id: legacyAlertId(ticker, "MOVE_PERCENT"),
          ticker,
          kind: "MOVE_PERCENT",
          threshold: rule.movePercent,
          enabled: true,
        });
      }
      if (rule.eventOnly === true) {
        alerts.push({
          id: legacyAlertId(ticker, "DISCLOSURE"),
          ticker,
          kind: "DISCLOSURE",
          enabled: true,
        });
      }
    }
  }

  return { watchlist, alerts };
}

export function useUpdateStockMarketPreferences() {
  const queryClient = useQueryClient();

  return useMutation<
    StockMarketPreferenceResponse,
    StockMarketPreferencesApiError,
    UpdateStockMarketPreferencesInput
  >({
    mutationKey: stockMarketPreferenceKeys.update,
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/stocks/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationId,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseStockMarketPreferencesError(response);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(stockMarketPreferenceKeys.all, data);
    },
  });
}

/** 최초 1회만 localStorage 설정을 서버 설정과 합친다. 이후 서버 응답이 SSOT다. */
export function useMigrateStockMarketPreferences() {
  const queryClient = useQueryClient();
  const query = useStockMarketPreferences();
  const update = useUpdateStockMarketPreferences();
  const attempted = useRef(false);

  useEffect(() => {
    if (
      attempted.current ||
      !query.data ||
      !query.data.novexEnabled ||
      query.data.migratedLocalStorageAt !== null ||
      update.isPending ||
      queryClient.isMutating({
        mutationKey: stockMarketPreferenceKeys.update,
      }) > 0
    ) {
      return;
    }
    attempted.current = true;
    update.mutate({
      operationId: crypto.randomUUID(),
      legacy: readLegacyStockMarketPreference(),
    });
  }, [query.data, queryClient, update]);

  return { query, migration: update };
}
