import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type {
  FactionActivityResponse,
  FactionBoardData,
} from "@/types/erp-realtime";

export const factionKeys = {
  all: ["factions"] as const,
  board: ["factions", "board"] as const,
  activity: (code: string) => ["factions", "activity", code] as const,
};

async function fetchFactionBoard(): Promise<FactionBoardData> {
  const response = await fetch("/api/erp/factions/board", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("세력 관계도를 불러올 수 없습니다.");
  }
  return response.json();
}

async function fetchFactionActivity(
  code: string,
): Promise<FactionActivityResponse> {
  const response = await fetch(
    `/api/erp/factions/${code.toLowerCase()}/activity`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("세력 접촉 기록을 불러올 수 없습니다.");
  }
  return response.json();
}

export function useFactionBoard(options?: {
  initialData?: FactionBoardData;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: factionKeys.board,
    queryFn: fetchFactionBoard,
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}

export function useFactionActivity(
  code: string,
  options?: { initialData?: FactionActivityResponse },
) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: factionKeys.activity(code),
    queryFn: () => fetchFactionActivity(code),
    enabled: code.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
