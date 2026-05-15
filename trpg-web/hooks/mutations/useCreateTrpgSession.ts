"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { trpgSessionKeys } from "@/hooks/queries/useTrpgSessions";

export interface CreateTrpgSessionInput {
  title: string;
  date: string;
  startTime: string;
  participantDiscordIds: string[];
}

export function useCreateTrpgSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTrpgSessionInput): Promise<{ id: string }> => {
      const res = await fetch("/api/trpg/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "세션 생성 실패");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpgSessionKeys.all });
    },
  });
}
