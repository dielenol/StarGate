"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { trpgSessionKeys } from "@/hooks/queries/useTrpgSessions";

export function useCancelTrpgSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ ok: true }> => {
      const res = await fetch(`/api/trpg/sessions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "세션 취소 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpgSessionKeys.all });
    },
  });
}
