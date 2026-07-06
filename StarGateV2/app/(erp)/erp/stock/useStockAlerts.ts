"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([ticker, rule]) => [normalizeTicker(ticker), sanitizeRule(rule)] as const)
      .filter(([ticker, rule]) => ticker && hasStockAlertRule(rule));
    return Object.fromEntries(entries);
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

export function useStockAlertRules() {
  const [rules, setRules] = useState<StockAlertRuleMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRules(readStoredRules());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [hydrated, rules]);

  const getRule = useCallback(
    (ticker: string): StockAlertRule => rules[normalizeTicker(ticker)] ?? {},
    [rules],
  );

  const setRule = useCallback((ticker: string, nextRule: StockAlertRule) => {
    const normalizedTicker = normalizeTicker(ticker);
    if (!normalizedTicker) return;
    const compacted = compactRule(nextRule);
    setRules((current) => {
      const next = { ...current };
      if (hasStockAlertRule(compacted)) {
        next[normalizedTicker] = compacted;
      } else {
        delete next[normalizedTicker];
      }
      return next;
    });
  }, []);

  const clearRule = useCallback((ticker: string) => {
    const normalizedTicker = normalizeTicker(ticker);
    if (!normalizedTicker) return;
    setRules((current) => {
      const next = { ...current };
      delete next[normalizedTicker];
      return next;
    });
  }, []);

  const configuredCount = useMemo(() => Object.keys(rules).length, [rules]);

  return useMemo(
    () => ({ rules, configuredCount, getRule, setRule, clearRule }),
    [clearRule, configuredCount, getRule, rules, setRule],
  );
}
