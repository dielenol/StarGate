import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { ClientSessionReport } from "@/types/session-report";

export const sessionReportKeys = {
  all: ["session-reports"] as const,
  byId: (id: string) => ["session-reports", "id", id] as const,
};

const REPORT_LIST_STALE_TIME_MS = 30 * 1000;
const REPORT_STALE_TIME_MS = 20 * 60 * 1000;

async function fetchSessionReports(): Promise<ClientSessionReport[]> {
  const res = await fetch("/api/erp/session-reports", { cache: "no-store" });
  if (!res.ok) throw new Error("세션 리포트를 불러올 수 없습니다.");
  const data = await res.json();
  return data.reports;
}

async function fetchSessionReportById(
  id: string,
): Promise<ClientSessionReport> {
  const response = await fetch(`/api/erp/session-reports/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("리포트를 불러올 수 없습니다.");
  }
  const data = (await response.json()) as {
    report: ClientSessionReport;
  };
  return data.report;
}

export function useSessionReports(options?: {
  initialData?: ClientSessionReport[];
  initialDataUpdatedAt?: number;
}) {
  return useQuery({
    queryKey: sessionReportKeys.all,
    queryFn: fetchSessionReports,
    staleTime: REPORT_LIST_STALE_TIME_MS,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}

export function useSessionReport(
  id: string,
  options?: { enabled?: boolean; initialData?: ClientSessionReport },
) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: sessionReportKeys.byId(id),
    queryFn: () => fetchSessionReportById(id),
    enabled: options?.enabled ?? id.length > 0,
    staleTime: REPORT_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
