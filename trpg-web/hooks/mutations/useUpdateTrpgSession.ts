"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { TrpgSessionView } from "@/lib/trpg/serializer";

import { trpgSessionKeys } from "@/hooks/queries/useTrpgSessions";

import {
  isConflictPayload,
  TrpgSessionConflictError,
} from "./useCreateTrpgSession";

export interface UpdateTrpgSessionPatchInput {
  title?: string;
  date?: string;
  startTime?: string;
  participantDiscordIds?: string[];
}

export interface UpdateTrpgSessionVariables {
  id: string;
  patch: UpdateTrpgSessionPatchInput;
}

export function useUpdateTrpgSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: UpdateTrpgSessionVariables): Promise<TrpgSessionView> => {
      const res = await fetch(`/api/trpg/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (res.status === 409) {
        const body: unknown = await res.json().catch(() => null);
        if (isConflictPayload(body)) {
          throw new TrpgSessionConflictError(body.conflictedParticipants);
        }
        // not-open 등 다른 409 — 서버 메시지를 그대로 전달.
        const msg =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "세션 갱신 충돌";
        throw new Error(msg);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "세션 갱신 실패");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpgSessionKeys.all });
    },
  });
}
