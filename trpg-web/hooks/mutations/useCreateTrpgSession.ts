"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { trpgSessionKeys } from "@/hooks/queries/useTrpgSessions";

export interface CreateTrpgSessionInput {
  title: string;
  date: string;
  startTime: string;
  participantDiscordIds: string[];
}

export interface ConflictPayload {
  error: "conflict";
  conflictedParticipants: string[];
}

/**
 * 충돌 시 throw 되는 전용 에러 — 컴포넌트에서 `err instanceof TrpgSessionConflictError`
 * 로 구분해 충돌된 참여자 표시를 한다.
 */
export class TrpgSessionConflictError extends Error {
  readonly conflictedParticipants: string[];

  constructor(conflictedParticipants: string[]) {
    super("같은 날짜에 이미 다른 세션에 참여 중인 사용자가 있습니다.");
    this.name = "TrpgSessionConflictError";
    this.conflictedParticipants = conflictedParticipants;
  }
}

/**
 * 알 수 없는 응답 본문이 ConflictPayload 형태인지 검사. as 단언 없이 narrowing.
 */
export function isConflictPayload(body: unknown): body is ConflictPayload {
  if (body === null || typeof body !== "object") return false;
  const maybe = body as { error?: unknown; conflictedParticipants?: unknown };
  if (maybe.error !== "conflict") return false;
  if (!Array.isArray(maybe.conflictedParticipants)) return false;
  return maybe.conflictedParticipants.every((v) => typeof v === "string");
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

      if (res.status === 409) {
        const body: unknown = await res.json().catch(() => null);
        if (isConflictPayload(body)) {
          throw new TrpgSessionConflictError(body.conflictedParticipants);
        }
        const msg =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : "세션 생성 충돌";
        throw new Error(msg);
      }
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
