"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useMigrateStockMarketPreferences,
  useUpdateStockMarketPreferences,
} from "@/hooks/mutations/useStockMarketPreferencesMutation";
import type { StockMarketAlertRule } from "@/hooks/queries/useStockMarketPreferencesQuery";
import type { StockPriceItem } from "@/hooks/queries/useStocksQuery";
import { formatStockValue } from "@/lib/stocks/pricing";

const STORAGE_KEY = "stargate.stock.alert-rules";

export interface StockAlertRule {
  belowPrice?: number;
  movePercent?: number;
  eventOnly?: boolean;
}

type StockAlertRuleMap = Record<string, StockAlertRule>;

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function sanitizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function sanitizeRule(value: unknown): StockAlertRule {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    belowPrice: sanitizePositiveNumber(raw.belowPrice),
    movePercent: sanitizePositiveNumber(raw.movePercent),
    eventOnly: raw.eventOnly === true,
  };
}

function compactRule(rule: StockAlertRule): StockAlertRule {
  return {
    belowPrice: sanitizePositiveNumber(rule.belowPrice),
    movePercent: sanitizePositiveNumber(rule.movePercent),
    eventOnly: rule.eventOnly === true,
  };
}

export function hasStockAlertRule(rule: StockAlertRule | undefined): boolean {
  return Boolean(rule?.belowPrice || rule?.movePercent || rule?.eventOnly);
}

function readStoredRules(): StockAlertRuleMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(
          ([ticker, rule]) =>
            [normalizeTicker(ticker), sanitizeRule(rule)] as const,
        )
        .filter(
          ([ticker, rule]) => ticker.length > 0 && hasStockAlertRule(rule),
        ),
    );
  } catch {
    return {};
  }
}

export function evaluateStockAlert(
  rule: StockAlertRule | undefined,
  item: Pick<StockPriceItem, "changePercent" | "eventText" | "price">,
): string[] {
  if (!hasStockAlertRule(rule)) return [];
  const reasons: string[] = [];
  if (rule?.belowPrice && item.price <= rule.belowPrice) {
    reasons.push(`목표가 이하 · ¤ ${formatStockValue(rule.belowPrice)}`);
  }
  if (rule?.movePercent && Math.abs(item.changePercent) >= rule.movePercent) {
    reasons.push(`등락률 ${rule.movePercent.toFixed(2)}% 돌파`);
  }
  if (rule?.eventOnly && item.eventText.trim()) {
    reasons.push(`공시 발생 · ${item.eventText.trim()}`);
  }
  return reasons;
}

function serverRuleId(ticker: string, kind: StockMarketAlertRule["kind"]): string {
  return `stock-alert:${ticker}:${kind.toLowerCase()}`;
}

function toServerRules(
  ticker: string,
  rule: StockAlertRule,
): StockMarketAlertRule[] {
  const next: StockMarketAlertRule[] = [];
  if (rule.belowPrice) {
    next.push({
      id: serverRuleId(ticker, "BELOW_PRICE"),
      ticker,
      kind: "BELOW_PRICE",
      threshold: rule.belowPrice,
      enabled: true,
    });
  }
  if (rule.movePercent) {
    next.push({
      id: serverRuleId(ticker, "MOVE_PERCENT"),
      ticker,
      kind: "MOVE_PERCENT",
      threshold: rule.movePercent,
      enabled: true,
    });
  }
  if (rule.eventOnly) {
    next.push({
      id: serverRuleId(ticker, "DISCLOSURE"),
      ticker,
      kind: "DISCLOSURE",
      enabled: true,
    });
  }
  return next;
}

export function useStockAlertRules() {
  const { query } = useMigrateStockMarketPreferences();
  const update = useUpdateStockMarketPreferences();
  const [localRules, setLocalRules] = useState<StockAlertRuleMap>({});
  const [localHydrated, setLocalHydrated] = useState(false);
  const novexEnabled = query.data?.novexEnabled === true;
  const serverReady =
    novexEnabled && query.data?.migratedLocalStorageAt !== null;
  const alerts = useMemo(() => query.data?.alerts ?? [], [query.data?.alerts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalRules(readStoredRules());
      setLocalHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!localHydrated || serverReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localRules));
  }, [localHydrated, localRules, serverReady]);

  const getRule = useCallback(
    (ticker: string): StockAlertRule => {
      const normalized = normalizeTicker(ticker);
      if (!serverReady) return localRules[normalized] ?? {};
      const relevant = alerts.filter(
        (item) => item.ticker === normalized && item.enabled,
      );
      return {
        belowPrice: relevant.find((item) => item.kind === "BELOW_PRICE")
          ?.threshold,
        movePercent: relevant.find((item) => item.kind === "MOVE_PERCENT")
          ?.threshold,
        eventOnly: relevant.some((item) => item.kind === "DISCLOSURE"),
      };
    },
    [alerts, localRules, serverReady],
  );

  const setRule = useCallback(
    (ticker: string, nextRule: StockAlertRule) => {
      const normalized = normalizeTicker(ticker);
      if (!normalized) return;
      const compacted = compactRule(nextRule);
      if (!serverReady) {
        setLocalRules((current) => {
          const next = { ...current };
          if (hasStockAlertRule(compacted)) next[normalized] = compacted;
          else delete next[normalized];
          return next;
        });
        return;
      }
      update.mutate({
        operationId: crypto.randomUUID(),
        alerts: [
          ...alerts.filter((item) => item.ticker !== normalized),
          ...toServerRules(normalized, compacted),
        ],
      });
    },
    [alerts, serverReady, update],
  );

  const clearRule = useCallback(
    (ticker: string) => {
      const normalized = normalizeTicker(ticker);
      if (!normalized) return;
      if (!serverReady) {
        setLocalRules((current) => {
          const next = { ...current };
          delete next[normalized];
          return next;
        });
        return;
      }
      update.mutate({
        operationId: crypto.randomUUID(),
        alerts: alerts.filter((item) => item.ticker !== normalized),
      });
    },
    [alerts, serverReady, update],
  );

  const configuredCount = useMemo(
    () => serverReady
      ? new Set(
          alerts.filter((item) => item.enabled).map((item) => item.ticker),
        ).size
      : Object.keys(localRules).length,
    [alerts, localRules, serverReady],
  );

  return useMemo(
    () => ({
      configuredCount,
      getRule,
      setRule,
      clearRule,
      isSaving: serverReady && update.isPending,
      novexEnabled,
      serverReady,
    }),
    [
      clearRule,
      configuredCount,
      getRule,
      novexEnabled,
      serverReady,
      setRule,
      update.isPending,
    ],
  );
}
