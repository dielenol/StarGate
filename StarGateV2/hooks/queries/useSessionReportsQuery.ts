import { useQuery } from "@tanstack/react-query";

import type { ClientSessionReport } from "@/types/session-report";

export const sessionReportKeys = {
  all: ["session-reports"] as const,
};

async function fetchSessionReports(): Promise<ClientSessionReport[]> {
  const res = await fetch("/api/erp/session-reports");
  if (!res.ok) throw new Error("세션 리포트를 불러올 수 없습니다.");
  const data = await res.json();
  return data.reports;
}

export function useSessionReports(options?: {
  initialData?: ClientSessionReport[];
}) {
  return useQuery({
    queryKey: sessionReportKeys.all,
    queryFn: fetchSessionReports,
    staleTime: 20 * 60 * 1000,
    initialData: options?.initialData,
  });
}
