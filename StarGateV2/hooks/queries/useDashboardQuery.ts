import { useQuery } from "@tanstack/react-query";

import type { ErpDashboardResponse } from "@/types/erp-realtime";

const DASHBOARD_REFRESH_MS = 60_000;

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

async function fetchDashboard(): Promise<ErpDashboardResponse> {
  const response = await fetch("/api/erp/dashboard", {
    // no-cache = ETag 재검증 허용 (304 시 브라우저 캐시 재사용)
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error("대시보드를 불러올 수 없습니다.");
  }
  return response.json();
}

export function useDashboard(options?: {
  initialData?: ErpDashboardResponse;
}) {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: fetchDashboard,
    staleTime: DASHBOARD_REFRESH_MS,
    // 연구 수령 기한·제작 완료 시각은 realtime 이벤트 없이도 바뀐다.
    // WebSocket 연결 중에도 시간 경과와 연구 worker 상태를 재확인한다.
    refetchInterval: DASHBOARD_REFRESH_MS,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
