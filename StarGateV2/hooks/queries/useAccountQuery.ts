import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { CurrentAccountResponse } from "@/types/erp-realtime";

export const accountKeys = {
  all: ["account"] as const,
};

async function fetchCurrentAccount(): Promise<CurrentAccountResponse> {
  const response = await fetch("/api/erp/account", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("계정 정보를 불러올 수 없습니다.");
  }
  return response.json();
}

export function useCurrentAccount(options?: {
  initialData?: CurrentAccountResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: accountKeys.all,
    queryFn: fetchCurrentAccount,
    staleTime: 5 * 60 * 1000,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
