import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { ErpDashboardResponse } from "@/types/erp-realtime";

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

async function fetchDashboard(): Promise<ErpDashboardResponse> {
  const response = await fetch("/api/erp/dashboard", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("대시보드를 불러올 수 없습니다.");
  }
  return response.json();
}

export function useDashboard(options?: {
  initialData?: ErpDashboardResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: fetchDashboard,
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
