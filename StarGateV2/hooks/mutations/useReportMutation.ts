import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionReportKeys } from "@/hooks/queries/useSessionReportsQuery";

interface CreateReportBody {
  sessionTitle: string;
  summary: string;
  highlights?: string[];
  participants?: string[];
}

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReportBody) => {
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
