import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export interface StockSeasonSummary {
  id: string;
  status: "SCHEDULED" | "ACTIVE" | "ENDED";
  startsAt: string;
  endsAt: string;
}

export interface StockSeasonLeaderboardItem {
  rank: number;
  codename: string;
  returnPercent: number;
  badge?: string;
  title?: string;
}

export interface StockSeasonMine {
  eligible: boolean;
  reason?: string;
  rank?: number;
  returnPercent?: number;
}

export interface StockSeasonLeaderboardResponse {
  season: StockSeasonSummary | null;
  items: StockSeasonLeaderboardItem[];
  mine?: StockSeasonMine;
}

export class StockSeasonApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StockSeasonApiError";
    this.status = status;
  }
}

export const stockSeasonKeys = {
  all: ["stocks", "seasons"] as const,
  leaderboard: ["stocks", "seasons", "leaderboard"] as const,
};

async function fetchStockSeasonLeaderboard(): Promise<StockSeasonLeaderboardResponse> {
  const response = await fetch("/api/erp/stocks/seasons/leaderboard", {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new StockSeasonApiError(
      body.error ?? "NOVEX 시즌 순위를 불러오지 못했습니다.",
      response.status,
    );
  }
  return response.json();
}

export function useStockSeasonLeaderboard(options?: {
  initialData?: StockSeasonLeaderboardResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(5 * 60_000);
  return useQuery({
    queryKey: stockSeasonKeys.leaderboard,
    queryFn: fetchStockSeasonLeaderboard,
    staleTime: 5 * 60_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
