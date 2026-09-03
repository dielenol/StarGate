import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  VttRuntimeActionInput,
  VttRuntimeActionResponse,
  VttRuntimeActionSuccess,
} from "@/types/vtt-runtime";

import { vttHostKeys } from "@/hooks/queries/useVttHostStatusQuery";
import { vttRuntimeKeys } from "@/hooks/queries/useVttRuntimeStatusQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";

export class VttRuntimeMutationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly connectedUsers?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    connectedUsers?: number,
  ) {
    super(message);
    this.name = "VttRuntimeMutationError";
    this.status = status;
    this.code = code;
    this.connectedUsers = connectedUsers;
  }
}

function fingerprint(input: VttRuntimeActionInput): string {
  return JSON.stringify({ action: input.action, force: input.force === true });
}

export function useVttRuntimeMutation() {
  const queryClient = useQueryClient();
  const retainedOperation = useRef<RetainedIdempotencyOperation | null>(null);

  return useMutation({
    retry: false,
    mutationFn: async (input: VttRuntimeActionInput) => {
      retainedOperation.current = retainIdempotencyOperation(
        retainedOperation.current,
        "vtt-runtime",
        fingerprint(input),
      );
      const response = await fetch("/api/erp/admin/vtt-runtime/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retainedOperation.current.key,
        },
        body: JSON.stringify(input),
      });
      const body = (await response.json().catch(() => null)) as
        | VttRuntimeActionResponse
        | null;
      if (!response.ok || !body?.ok) {
        const failure = body && !body.ok ? body : null;
        throw new VttRuntimeMutationError(
          failure?.error ?? "VTT 제어 요청에 실패했습니다.",
          response.status,
          failure?.code ?? "ACTION_FAILED",
          failure?.connectedUsers,
        );
      }
      return body as VttRuntimeActionSuccess;
    },
    onSuccess: (data, input) => {
      const current = retainedOperation.current;
      if (current?.fingerprint === fingerprint(input)) {
        retainedOperation.current = clearRetainedIdempotencyOperation(
          current,
          current.key,
        );
      }
      queryClient.setQueryData(vttRuntimeKeys.status, data.status);
    },
    onError: (error, input) => {
      if (
        error instanceof VttRuntimeMutationError &&
        !["ACTION_RESULT_UNKNOWN", "ACTION_LOCKED", "ACTION_OUTCOME_PENDING"].includes(
          error.code,
        )
      ) {
        const current = retainedOperation.current;
        if (current?.fingerprint === fingerprint(input)) {
          retainedOperation.current = clearRetainedIdempotencyOperation(
            current,
            current.key,
          );
        }
      }
    },
    onSettled: async (_data, error, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: vttRuntimeKeys.status }),
        queryClient.invalidateQueries({ queryKey: vttHostKeys.status }),
      ]);
      if (
        error instanceof VttRuntimeMutationError &&
        error.code === "ACTION_RESULT_UNKNOWN"
      ) {
        const current = retainedOperation.current;
        if (current?.fingerprint === fingerprint(input)) {
          retainedOperation.current = clearRetainedIdempotencyOperation(
            current,
            current.key,
          );
        }
      }
    },
  });
}
