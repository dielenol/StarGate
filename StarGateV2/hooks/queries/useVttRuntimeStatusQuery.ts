import { useQuery } from "@tanstack/react-query";

import type { VttRuntimeStatus } from "@/types/vtt-runtime";

export const vttRuntimeKeys = {
  status: ["admin-vtt-runtime", "status"] as const,
};

function isTransitioning(status: VttRuntimeStatus | undefined): boolean {
  return status?.state === "STARTING" || status?.state === "STOPPING";
}

async function fetchVttRuntimeStatus(): Promise<VttRuntimeStatus> {
  const response = await fetch("/api/erp/admin/vtt-runtime", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "VTT 상태를 불러오지 못했습니다.");
  }
  return response.json();
}

export function useVttRuntimeStatusQuery(initialData: VttRuntimeStatus) {
  return useQuery({
    queryKey: vttRuntimeKeys.status,
    queryFn: fetchVttRuntimeStatus,
    initialData,
    staleTime: 2_000,
    retry: 1,
    refetchInterval: query =>
      isTransitioning(query.state.data) ? 2_000 : 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
