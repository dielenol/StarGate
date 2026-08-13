import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  parseStockScheduledEventsError,
  type StockScheduledEventItem,
  StockScheduledEventsApiError,
  stockScheduledEventsKeys,
} from "@/hooks/queries/useStockScheduledEventsQuery";

export interface CreateStockScheduledEventInput {
  ticker: string;
  kstDate: string;
  changePercent: number;
  eventText: string;
  eventTier: "scenario" | "shock";
  operationId: string;
}
export interface CancelStockScheduledEventInput {
  eventId: string;
  operationId: string;
}

interface CreateStockScheduledEventResponse {
  item: StockScheduledEventItem;
}

interface CancelStockScheduledEventResponse {
  eventId: string;
  status: "CANCELLED";
}

export function useCreateStockScheduledEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateStockScheduledEventResponse,
    StockScheduledEventsApiError,
    CreateStockScheduledEventInput
  >({
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/admin/stocks/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationId,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseStockScheduledEventsError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockScheduledEventsKeys.all });
    },
  });
}

export function useCancelStockScheduledEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    CancelStockScheduledEventResponse,
    StockScheduledEventsApiError,
    CancelStockScheduledEventInput
  >({
    mutationFn: async ({ eventId, operationId }) => {
      const response = await fetch(
        `/api/erp/admin/stocks/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: { "Idempotency-Key": operationId },
        },
      );
      if (!response.ok) await parseStockScheduledEventsError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockScheduledEventsKeys.all });
    },
  });
}
