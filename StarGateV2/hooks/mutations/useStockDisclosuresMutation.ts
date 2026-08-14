import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  parseStockDisclosuresError,
  type StockDisclosureEffect,
  type StockDisclosureItem,
  type StockDisclosureStatus,
  StockDisclosuresApiError,
  stockDisclosureKeys,
} from "@/hooks/queries/useStockDisclosuresQuery";
import { stocksKeys } from "@/hooks/queries/useStocksQuery";

export interface CreateStockDisclosureInput {
  operationId: string;
  status: Extract<
    StockDisclosureStatus,
    "DRAFT" | "SCHEDULED" | "PUBLISHED"
  >;
  kind: "INFO" | "PRICE";
  scope: "MARKET" | "TICKERS";
  tickers: string[];
  publishAt?: string;
  headline: string;
  body: string;
  effects: StockDisclosureEffect[];
  forceCooldown?: boolean;
}

export interface UpdateStockDisclosureInput {
  operationId: string;
  id: string;
  status?: Extract<
    StockDisclosureStatus,
    "DRAFT" | "SCHEDULED" | "PUBLISHED"
  >;
  kind?: "INFO" | "PRICE";
  scope?: "MARKET" | "TICKERS";
  tickers?: string[];
  publishAt?: string;
  headline?: string;
  body?: string;
  effects?: StockDisclosureEffect[];
  forceCooldown?: boolean;
}

export interface CancelStockDisclosureInput {
  operationId: string;
  id: string;
}

interface StockDisclosureMutationResponse {
  item: StockDisclosureItem;
}

function stockDisclosureHeaders(operationId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": operationId,
  };
}

function invalidateDisclosureQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: stockDisclosureKeys.all });
  queryClient.invalidateQueries({ queryKey: stocksKeys.prices });
  queryClient.invalidateQueries({ queryKey: stocksKeys.marketWire(7, 12) });
}

export function useCreateStockDisclosure() {
  const queryClient = useQueryClient();

  return useMutation<
    StockDisclosureMutationResponse,
    StockDisclosuresApiError,
    CreateStockDisclosureInput
  >({
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/admin/stocks/disclosures", {
        method: "POST",
        headers: stockDisclosureHeaders(operationId),
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseStockDisclosuresError(response);
      return response.json();
    },
    onSuccess: () => invalidateDisclosureQueries(queryClient),
  });
}

export function useUpdateStockDisclosure() {
  const queryClient = useQueryClient();

  return useMutation<
    StockDisclosureMutationResponse,
    StockDisclosuresApiError,
    UpdateStockDisclosureInput
  >({
    mutationFn: async (input) => {
      const { id, operationId, ...payload } = input;
      const response = await fetch(
        `/api/erp/admin/stocks/disclosures/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: stockDisclosureHeaders(operationId),
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) await parseStockDisclosuresError(response);
      return response.json();
    },
    onSuccess: () => invalidateDisclosureQueries(queryClient),
  });
}

export function useCancelStockDisclosure() {
  const queryClient = useQueryClient();

  return useMutation<
    StockDisclosureMutationResponse,
    StockDisclosuresApiError,
    CancelStockDisclosureInput
  >({
    mutationFn: async ({ id, operationId }) => {
      const response = await fetch(
        `/api/erp/admin/stocks/disclosures/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { "Idempotency-Key": operationId },
        },
      );
      if (!response.ok) await parseStockDisclosuresError(response);
      return response.json();
    },
    onSuccess: () => invalidateDisclosureQueries(queryClient),
  });
}
