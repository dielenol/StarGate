import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminInventoryOverviewKeys } from "@/hooks/queries/useAdminInventoryOverviewQuery";
import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import {
  ResearchApiError,
  researchKeys,
  throwResearchError,
} from "@/hooks/queries/useResearchQuery";
import type {
  ExtractZuluSampleResponse,
  UnlockZuluSampleLineResponse,
} from "@/lib/research/zulu-sample-lab";

interface ConfirmedResearchMutation {
  confirmation: true;
  operationId: string;
}

export function useUnlockZuluSampleLine() {
  const queryClient = useQueryClient();

  return useMutation<
    UnlockZuluSampleLineResponse,
    ResearchApiError,
    ConfirmedResearchMutation
  >({
    mutationFn: async (input) => {
      const response = await fetch("/api/erp/research/zulu-0028/submit", {
        method: "POST",
        headers: {
          "Idempotency-Key": input.operationId,
        },
      });
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: researchKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({
        queryKey: adminInventoryOverviewKeys.all,
      });
    },
    retry: (failureCount, error) =>
      !(error instanceof ResearchApiError) && failureCount < 1,
  });
}

export function useExtractZuluSample() {
  const queryClient = useQueryClient();

  return useMutation<
    ExtractZuluSampleResponse,
    ResearchApiError,
    ConfirmedResearchMutation
  >({
    mutationFn: async (input) => {
      const response = await fetch("/api/erp/research/zulu-0028/extract", {
        method: "POST",
        headers: {
          "Idempotency-Key": input.operationId,
        },
      });
      if (!response.ok) await throwResearchError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: researchKeys.all });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({
        queryKey: adminInventoryOverviewKeys.all,
      });
      queryClient.invalidateQueries({ queryKey: creditKeys.all });
    },
    retry: (failureCount, error) =>
      !(error instanceof ResearchApiError) && failureCount < 1,
  });
}
