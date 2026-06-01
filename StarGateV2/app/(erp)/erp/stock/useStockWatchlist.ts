"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "stargate.stock.watchlist";

function readStoredWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function useStockWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTickers(readStoredWatchlist());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  }, [hydrated, tickers]);

  const tickerSet = useMemo(() => new Set(tickers), [tickers]);

  const isWatched = useCallback(
    (ticker: string) => tickerSet.has(ticker.toUpperCase()),
    [tickerSet],
  );

  const toggle = useCallback((ticker: string) => {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return;
    setTickers((current) => {
      if (current.includes(normalized)) {
        return current.filter((item) => item !== normalized);
      }
      return [...current, normalized].sort();
    });
  }, []);

  return { tickers, isWatched, toggle };
}
