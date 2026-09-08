import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { TradesResponse } from "@/types/trade";

export const tradeKeys = {
  all: ["trades"] as const,
  target: (tradeId: string) => ["trades", "target", tradeId] as const,
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

async function fetchTrades(tradeId?: string): Promise<TradesResponse> {
  // no-cache = ETag 재검증 허용 (304 시 브라우저 캐시 재사용)
  const response = await fetch(tradeId ? `/api/erp/trades?tradeId=${encodeURIComponent(tradeId)}` : "/api/erp/trades", { cache: "no-cache" });
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

export function useTradesQuery(tradeId?: string) {
  // 10s 폴링 — 요청당 6 DB RTT 라 2.5s 는 과도. 자기 탭 뮤테이션은 invalidation 이
  // 즉시 갱신하고, realtime primary 전환 시 폴링은 자동 해제된다.
  const refetchInterval = useRealtimeRefetchInterval(10_000);
  return useQuery({
    queryKey: tradeId ? tradeKeys.target(tradeId) : tradeKeys.all,
    queryFn: () => fetchTrades(tradeId),
    staleTime: 5_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof TradesApiError && error.status < 500) return false;
      return failureCount < 2;
    },
  });
}
