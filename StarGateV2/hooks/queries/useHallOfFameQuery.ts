import { useQuery } from "@tanstack/react-query";

import type { ResearchHallOfFameResponse } from "@stargate/core";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export const hallOfFameKeys = {
  all: ["hall-of-fame"] as const,
  research: ["hall-of-fame", "research"] as const,
};

const RESEARCH_HALL_OF_FAME_STALE_TIME_MS = 5 * 60 * 1000;
const RESEARCH_HALL_OF_FAME_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

async function fetchResearchHallOfFame(): Promise<ResearchHallOfFameResponse> {
  const response = await fetch("/api/erp/hall-of-fame/research", {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "연구 공로 순위를 불러올 수 없습니다.");
  }
  return response.json() as Promise<ResearchHallOfFameResponse>;
}

export function useResearchHallOfFame(options?: {
  initialData?: ResearchHallOfFameResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    RESEARCH_HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.research,
    queryFn: fetchResearchHallOfFame,
    staleTime: RESEARCH_HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}
