"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useMigrateStockMarketPreferences,
  useUpdateStockMarketPreferences,
} from "@/hooks/mutations/useStockMarketPreferencesMutation";

const STORAGE_KEY = "stargate.stock.watchlist";

function readStoredWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
      ),
    ).sort();
  } catch {
    return [];
  }
}

export function useStockWatchlist() {
  const { query } = useMigrateStockMarketPreferences();
  const update = useUpdateStockMarketPreferences();
  const [localTickers, setLocalTickers] = useState<string[]>([]);
  const [localHydrated, setLocalHydrated] = useState(false);
  const novexEnabled = query.data?.novexEnabled === true;
  const serverReady =
    novexEnabled && query.data?.migratedLocalStorageAt !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalTickers(readStoredWatchlist());
      setLocalHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!localHydrated || serverReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localTickers));
  }, [localHydrated, localTickers, serverReady]);

  const tickers = useMemo(
    () => (serverReady ? (query.data?.watchlist ?? []) : localTickers),
    [localTickers, query.data?.watchlist, serverReady],
  );
  const tickerSet = useMemo(() => new Set(tickers), [tickers]);

  const isWatched = useCallback(
    (ticker: string) => tickerSet.has(ticker.trim().toUpperCase()),
    [tickerSet],
  );

  const toggle = useCallback(
    (ticker: string) => {
      const normalized = ticker.trim().toUpperCase();
      if (!normalized) return;
      if (!serverReady) {
        setLocalTickers((current) =>
          current.includes(normalized)
            ? current.filter((item) => item !== normalized)
            : [...current, normalized].sort(),
        );
        return;
      }
      const watchlist = tickerSet.has(normalized)
        ? tickers.filter((item) => item !== normalized)
        : [...tickers, normalized].sort();
      update.mutate({
        operationId: crypto.randomUUID(),
        watchlist,
      });
    },
    [serverReady, tickerSet, tickers, update],
  );

  return {
    tickers,
    isWatched,
    toggle,
    hydrated: serverReady ? !query.isPending : localHydrated,
    isSaving: serverReady && update.isPending,
    novexEnabled,
  };
}
