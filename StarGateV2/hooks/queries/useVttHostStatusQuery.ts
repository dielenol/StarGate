import { useQuery } from "@tanstack/react-query";

import type { VttHostStatus } from "@/types/vtt-host-control";

export const vttHostKeys = {
  status: ["admin-vtt-hosts", "status"] as const,
};

function isTransitioning(status: VttHostStatus | undefined): boolean {
  return status?.state === "SWITCHING";
}

async function fetchVttHostStatus(): Promise<VttHostStatus> {
  const response = await fetch("/api/erp/admin/vtt-hosts", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "VTT 호스트 상태를 불러오지 못했습니다.");
  }
  return response.json();
}

export function useVttHostStatusQuery(initialData: VttHostStatus) {
  return useQuery({
    queryKey: vttHostKeys.status,
    queryFn: fetchVttHostStatus,
    initialData,
    staleTime: 2_000,
    retry: 1,
    refetchInterval: query =>
      isTransitioning(query.state.data) ? 2_000 : 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
