import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionReportKeys } from "@/hooks/queries/useSessionReportsQuery";

interface ReportMutationBody {
  sessionId?: string;
  sessionTitle: string;
  summary: string;
  highlights?: string[];
  participants?: string[];
  locationLabel?: string;
  mapX?: number;
  mapY?: number;
  mapPrecision?: "confirmed" | "estimated";
}

interface ReportUpdateMutationBody
  extends Omit<
    ReportMutationBody,
    "locationLabel" | "mapX" | "mapY" | "mapPrecision"
  > {
  locationLabel?: string | null;
  mapX?: number | null;
  mapY?: number | null;
  mapPrecision?: "confirmed" | "estimated" | null;
}

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReportMutationBody) => {
      const res = await fetch("/api/erp/session-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "리포트 생성에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionReportKeys.all });
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: ReportUpdateMutationBody;
    }) => {
      const res = await fetch(`/api/erp/session-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "리포트 수정에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionReportKeys.all });
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/erp/session-reports/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "리포트 삭제에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionReportKeys.all });
    },
  });
}
