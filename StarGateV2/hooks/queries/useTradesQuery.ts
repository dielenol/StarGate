import { useQuery } from "@tanstack/react-query";

import type { TradesResponse } from "@/types/trade";

export const tradeKeys = {
  all: ["trades"] as const,
};

export class TradesApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "TradesApiError";
  }
}

async function fetchTrades(): Promise<TradesResponse> {
  const response = await fetch("/api/erp/trades", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new TradesApiError(
      body.error ?? "거래 정보를 불러올 수 없습니다.",
      response.status,
      body.code,
    );
  }
  return response.json();
}

export function useTradesQuery() {
  return useQuery({
    queryKey: tradeKeys.all,
    queryFn: fetchTrades,
    staleTime: 1_000,
    refetchInterval: 2_500,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof TradesApiError && error.status < 500) return false;
      return failureCount < 2;
    },
  });
}
