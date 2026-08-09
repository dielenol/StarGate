import { useQuery } from "@tanstack/react-query";

import type { AdminIntegrationStatusResponse } from "@/types/admin-integration-status";

export const adminIntegrationStatusKeys = {
  all: ["admin-integration-status"] as const,
};

async function fetchAdminIntegrationStatus(): Promise<AdminIntegrationStatusResponse> {
  const response = await fetch("/api/erp/admin/integration-status", {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "Discord 연동 현황을 불러오지 못했습니다.");
  }
  return response.json();
}

export function useAdminIntegrationStatusQuery(options: {
  initialData: AdminIntegrationStatusResponse;
}) {
  return useQuery({
    queryKey: adminIntegrationStatusKeys.all,
    queryFn: fetchAdminIntegrationStatus,
    initialData: options.initialData,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
