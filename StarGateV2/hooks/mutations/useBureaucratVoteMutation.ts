import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { SerializedBureaucratVote } from "@/lib/bureaucrat-votes/contracts";
import {
  BureaucratVoteApiError,
  bureaucratVoteKeys,
} from "@/hooks/queries/useBureaucratVotesQuery";

export interface CreateBureaucratVoteVariables {
  presetKey: string;
  operationId: string;
}

async function createBureaucratVoteFromPreset(
  input: CreateBureaucratVoteVariables,
): Promise<{ vote: SerializedBureaucratVote; created: boolean }> {
  const response = await fetch("/api/erp/admin/bureaucrat-votes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.operationId,
    },
    body: JSON.stringify({ presetKey: input.presetKey }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    vote?: SerializedBureaucratVote;
    created?: boolean;
  };
  if (!response.ok || !body.vote) {
    throw new BureaucratVoteApiError(
      body.error ?? "관료 표결 안건을 등재하지 못했습니다.",
      response.status,
      body.code,
    );
  }
  return { vote: body.vote, created: body.created === true };
}

export function useCreateBureaucratVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBureaucratVoteFromPreset,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bureaucratVoteKeys.all });
    },
  });
}
