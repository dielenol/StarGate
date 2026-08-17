import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type AdminStockCalendarResponse,
  type AdminStockCorporateActionsResponse,
  AdminStockMarketApiError,
  adminStockMarketKeys,
  parseAdminStockMarketError,
} from "@/hooks/queries/useAdminStockMarketQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import { stockDisclosureKeys } from "@/hooks/queries/useStockDisclosuresQuery";
import { stocksKeys } from "@/hooks/queries/useStocksQuery";
import { tradeKeys } from "@/hooks/queries/useTradesQuery";

export interface UpsertStockCalendarExceptionInput {
  operationId: string;
  kstDate: string;
  mode: "EARLY_CLOSE" | "NORMAL_HOURS";
  closeAt: string | null;
  reason: string;
}

export interface DeleteStockCalendarExceptionInput {
  operationId: string;
  kstDate: string;
}

export interface ScheduleStockCorporateActionInput {
  operationId: string;
  type: "DIVIDEND" | "SPLIT" | "RIGHTS_OFFERING";
  ticker: string;
  executeAt: string;
  perShare?: number;
  ratio?: number;
  announceAt?: string;
  reason?: string;
  priceAdjustmentPercent?: number;
}

export interface CancelStockCorporateActionInput {
  operationId: string;
  id: string;
}

export interface RecoverStockMarketSlotInput {
  operationId: string;
  slotKey: string;
}

interface RecoverStockMarketSlotResponse {
  slotKey: string;
  status: "QUEUED";
}

function jsonHeaders(operationId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": operationId,
  };
}

function invalidateAdminMarket(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: stocksKeys.all });
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useUpsertStockCalendarException() {
  const queryClient = useQueryClient();
  return useMutation<
    AdminStockCalendarResponse,
    AdminStockMarketApiError,
    UpsertStockCalendarExceptionInput
  >({
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/admin/stocks/calendar", {
        method: "PUT",
        headers: jsonHeaders(operationId),
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseAdminStockMarketError(response);
      return response.json();
    },
    onSuccess: () => invalidateAdminMarket(queryClient),
  });
}

export function useDeleteStockCalendarException() {
  const queryClient = useQueryClient();
  return useMutation<
    AdminStockCalendarResponse,
    AdminStockMarketApiError,
    DeleteStockCalendarExceptionInput
  >({
    mutationFn: async ({ operationId, kstDate }) => {
      const response = await fetch(
        `/api/erp/admin/stocks/calendar?kstDate=${encodeURIComponent(kstDate)}`,
        { method: "DELETE", headers: { "Idempotency-Key": operationId } },
      );
      if (!response.ok) await parseAdminStockMarketError(response);
      return response.json();
    },
    onSuccess: () => invalidateAdminMarket(queryClient),
  });
}

export function useScheduleStockCorporateAction() {
  const queryClient = useQueryClient();
  return useMutation<
    AdminStockCorporateActionsResponse,
    AdminStockMarketApiError,
    ScheduleStockCorporateActionInput
  >({
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/admin/stocks/corporate-actions", {
        method: "POST",
        headers: jsonHeaders(operationId),
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseAdminStockMarketError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminStockMarketKeys.corporateActions,
      });
      queryClient.invalidateQueries({ queryKey: stockDisclosureKeys.all });
    },
  });
}

export function useCancelStockCorporateAction() {
  const queryClient = useQueryClient();
  return useMutation<
    AdminStockCorporateActionsResponse,
    AdminStockMarketApiError,
    CancelStockCorporateActionInput
  >({
    mutationFn: async ({ id, operationId }) => {
      const response = await fetch(
        `/api/erp/admin/stocks/corporate-actions/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { "Idempotency-Key": operationId } },
      );
      if (!response.ok) await parseAdminStockMarketError(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminStockMarketKeys.corporateActions,
      });
      queryClient.invalidateQueries({ queryKey: stockDisclosureKeys.all });
      invalidateAdminMarket(queryClient);
      queryClient.invalidateQueries({ queryKey: tradeKeys.all });
    },
  });
}

export function useRecoverStockMarketSlot() {
  const queryClient = useQueryClient();
  return useMutation<
    RecoverStockMarketSlotResponse,
    AdminStockMarketApiError,
    RecoverStockMarketSlotInput
  >({
    mutationFn: async (input) => {
      const { operationId, ...payload } = input;
      const response = await fetch("/api/erp/admin/stocks/recovery", {
        method: "POST",
        headers: jsonHeaders(operationId),
        body: JSON.stringify(payload),
      });
      if (!response.ok) await parseAdminStockMarketError(response);
      return response.json();
    },
    onSuccess: () => invalidateAdminMarket(queryClient),
  });
}
