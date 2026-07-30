import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { AdminInventoryOverviewResponse } from "@/types/erp-realtime";

export const adminInventoryOverviewKeys = {
  all: ["admin-inventory-overview"] as const,
};

async function fetchAdminInventoryOverview(): Promise<AdminInventoryOverviewResponse> {
  const response = await fetch("/api/erp/admin/inventory/overview", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("인벤토리 운용 현황을 불러올 수 없습니다.");
  }
  return response.json();
}

export function useAdminInventoryOverview(options?: {
  initialData?: AdminInventoryOverviewResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: adminInventoryOverviewKeys.all,
    queryFn: fetchAdminInventoryOverview,
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
