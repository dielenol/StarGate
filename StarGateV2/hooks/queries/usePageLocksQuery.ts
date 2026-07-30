import { useQuery } from "@tanstack/react-query";

import type { ErpPageLockOverrides } from "@/lib/erp/page-lock-policy";
import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export interface PageLocksResponse {
  overrides: ErpPageLockOverrides;
}

export const pageLockKeys = {
  all: ["erp-page-locks"] as const,
};

const PAGE_LOCK_STALE_TIME_MS = 15 * 1000;
const PAGE_LOCK_REFETCH_INTERVAL_MS = 30 * 1000;

async function fetchPageLocks(): Promise<PageLocksResponse> {
  const response = await fetch("/api/erp/page-locks", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("페이지 잠금 상태를 불러오지 못했습니다.");
  }
  return response.json();
}

export function usePageLocks(options?: { initialData?: PageLocksResponse }) {
  const refetchInterval = useRealtimeRefetchInterval(
    PAGE_LOCK_REFETCH_INTERVAL_MS,
  );
  return useQuery({
    queryKey: pageLockKeys.all,
    queryFn: fetchPageLocks,
    initialData: options?.initialData,
    staleTime: PAGE_LOCK_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
