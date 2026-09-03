import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  VttHostActionInput,
  VttHostActionResponse,
  VttHostActionSuccess,
} from "@/types/vtt-host-control";

import { vttHostKeys } from "@/hooks/queries/useVttHostStatusQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";

export class VttHostMutationError extends Error {
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
    this.name = "VttHostMutationError";
    this.status = status;
    this.code = code;
    this.connectedUsers = connectedUsers;
  }
}

function fingerprint(input: VttHostActionInput): string {
  return input.action === "SELECT_ROUTE"
    ? JSON.stringify({
        action: input.action,
        targetHost: input.targetHost,
      })
    : JSON.stringify({
        action: input.action,
        sourceHost: input.sourceHost,
        targetHost: input.targetHost,
      });
}

export function useVttHostMutation() {
  const queryClient = useQueryClient();
  const retainedOperation = useRef<RetainedIdempotencyOperation | null>(null);

  return useMutation({
    retry: false,
    mutationFn: async (input: VttHostActionInput) => {
      retainedOperation.current = retainIdempotencyOperation(
        retainedOperation.current,
        "vtt-host",
        fingerprint(input),
      );
      const response = await fetch("/api/erp/admin/vtt-hosts/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retainedOperation.current.key,
        },
        body: JSON.stringify(input),
      });
      const body = (await response.json().catch(() => null)) as
        | VttHostActionResponse
        | null;
      if (!response.ok || !body?.ok) {
        const failure = body && !body.ok ? body : null;
        throw new VttHostMutationError(
          failure?.error ?? "VTT 경로·동기화 요청에 실패했습니다.",
          response.status,
          failure?.code ?? "ACTION_FAILED",
          failure?.connectedUsers,
        );
      }
      return body as VttHostActionSuccess;
    },
    onSuccess: (data, input) => {
      const current = retainedOperation.current;
      if (current?.fingerprint === fingerprint(input)) {
        retainedOperation.current = clearRetainedIdempotencyOperation(
          current,
          current.key,
        );
      }
      queryClient.setQueryData(vttHostKeys.status, data.status);
    },
    onError: (error, input) => {
      if (
        error instanceof VttHostMutationError &&
        error.code !== "ACTION_RESULT_UNKNOWN"
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
      await queryClient.invalidateQueries({ queryKey: vttHostKeys.status });
      if (
        error instanceof VttHostMutationError &&
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
