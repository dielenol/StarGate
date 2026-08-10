import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminInventoryOverviewKeys } from "@/hooks/queries/useAdminInventoryOverviewQuery";
import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import {
  ResearchApiError,
  researchKeys,
  throwResearchError,
} from "@/hooks/queries/useResearchQuery";
import type {
  ResearchActionResponse,
  ResearchChatResponse,
  ResearchChoiceResponse,
  ResearchLabOverview,
} from "@/types/research";
import type {
  ResearchDestination,
  ResearchRecipeId,
} from "@stargate/shared-db";

interface OperationInput {
  operationId: string;
}

interface RecipeOperationInput extends OperationInput {
  recipeId: ResearchRecipeId;
}

interface QueueOperationInput extends RecipeOperationInput {
  destination: ResearchDestination;
}

interface JobOperationInput extends OperationInput {
  jobId: string;
}

function mutationRetry(failureCount: number, error: unknown): boolean {
  return !(error instanceof ResearchApiError) && failureCount < 1;
}

function useInvalidateResearchEconomy() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: researchKeys.all }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: adminInventoryOverviewKeys.all }),
      queryClient.invalidateQueries({ queryKey: creditKeys.all }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    ]);
  };
}

export function useStartInitialResearch() {
  const invalidate = useInvalidateResearchEconomy();
  return useMutation<ResearchActionResponse, ResearchApiError, RecipeOperationInput>({
    mutationFn: async (input) => {
      const response = await fetch(
        `/api/erp/research/${encodeURIComponent(input.recipeId)}/initial`,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.operationId },
        },
      );
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: invalidate,
    retry: mutationRetry,
  });
}

export function useQueueResearchJob() {
  const invalidate = useInvalidateResearchEconomy();
  return useMutation<ResearchActionResponse, ResearchApiError, QueueOperationInput>({
    mutationFn: async (input) => {
      const response = await fetch(
        `/api/erp/research/${encodeURIComponent(input.recipeId)}/jobs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": input.operationId,
          },
          body: JSON.stringify({ destination: input.destination }),
        },
      );
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: invalidate,
    retry: mutationRetry,
  });
}

export function useCancelResearchJob() {
  const invalidate = useInvalidateResearchEconomy();
  return useMutation<ResearchActionResponse, ResearchApiError, JobOperationInput>({
    mutationFn: async (input) => {
      const response = await fetch(
        `/api/erp/research/jobs/${encodeURIComponent(input.jobId)}/cancel`,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.operationId },
        },
      );
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: invalidate,
    retry: mutationRetry,
  });
}

export function useClaimResearchJob() {
  const invalidate = useInvalidateResearchEconomy();
  return useMutation<ResearchActionResponse, ResearchApiError, JobOperationInput>({
    mutationFn: async (input) => {
      const response = await fetch(
        `/api/erp/research/jobs/${encodeURIComponent(input.jobId)}/claim`,
        {
          method: "POST",
          headers: { "Idempotency-Key": input.operationId },
        },
      );
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: invalidate,
    retry: mutationRetry,
  });
}

export function useXenoChoice() {
  const queryClient = useQueryClient();
  return useMutation<ResearchChoiceResponse, ResearchApiError, { choiceId: string }>({
    mutationFn: async (input) => {
      const response = await fetch("/api/erp/research/xeno/choices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: (response) => {
      queryClient.setQueryData<ResearchLabOverview>(
        researchKeys.overview,
        (current) =>
          current?.xeno
            ? {
                ...current,
                xeno: {
                  ...current.xeno,
                  relationship: response.relationship,
                  dialogue: {
                    ...current.xeno.dialogue,
                    text: response.dialogue.text,
                    expression: response.dialogue.expression,
                    choices: [],
                  },
                },
              }
            : current,
      );
    },
    retry: false,
  });
}

export function useXenoChat() {
  const queryClient = useQueryClient();
  return useMutation<ResearchChatResponse, ResearchApiError, { message: string }>({
    mutationFn: async (input) => {
      const response = await fetch("/api/erp/research/xeno/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: (response, variables) => {
      const userCreatedAt = new Date(
        Date.parse(response.message.createdAt) - 1,
      ).toISOString();
      queryClient.setQueryData<ResearchLabOverview>(
        researchKeys.overview,
        (current) =>
          current?.xeno
            ? {
                ...current,
                xeno: {
                  ...current.xeno,
                  dialogue: {
                    ...current.xeno.dialogue,
                    text: response.message.content,
                    expression: response.expression,
                  },
                  recentMessages: [
                    ...current.xeno.recentMessages,
                    {
                      role: "user" as const,
                      content: variables.message,
                      createdAt: userCreatedAt,
                    },
                    response.message,
                  ].slice(-20),
                  chatRemaining: response.remaining,
                  chatRetryAt: response.retryAt,
                },
              }
            : current,
      );
    },
    retry: false,
  });
}
