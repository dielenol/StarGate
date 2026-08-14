import { useQuery } from "@tanstack/react-query";

export interface StockCalendarExceptionItem {
  id: string;
  kstDate: string;
  mode: "EARLY_CLOSE" | "NORMAL_HOURS";
  closeAt: string | null;
  reason: string;
  updatedAt: string;
}

export interface AdminStockCalendarResponse {
  items: StockCalendarExceptionItem[];
}

export interface StockCorporateActionItem {
  id: string;
  type: "DIVIDEND" | "SPLIT";
  status:
    | "SCHEDULED"
    | "SNAPSHOTTED"
    | "PROCESSING"
    | "COMPLETED"
    | "ERROR"
    | "CANCELLED";
  ticker: string;
  executeAt: string;
  perShare?: number;
  ratio?: number;
  recordAt?: string;
}

export interface AdminStockCorporateActionsResponse {
  items: StockCorporateActionItem[];
}

export class AdminStockMarketApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminStockMarketApiError";
    this.status = status;
  }
}

export const adminStockMarketKeys = {
  all: ["stocks", "admin"] as const,
  calendar: ["stocks", "admin", "calendar"] as const,
  corporateActions: ["stocks", "admin", "corporate-actions"] as const,
};

export async function parseAdminStockMarketError(
  response: Response,
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new AdminStockMarketApiError(
    body.error ?? "NOVEX 운영 API 호출에 실패했습니다.",
    response.status,
  );
}

async function fetchAdminStockMarket<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) await parseAdminStockMarketError(response);
  return response.json();
}

export function useAdminStockCalendar(options?: {
  initialData?: AdminStockCalendarResponse;
}) {
  return useQuery({
    queryKey: adminStockMarketKeys.calendar,
    queryFn: () =>
      fetchAdminStockMarket<AdminStockCalendarResponse>(
        "/api/erp/admin/stocks/calendar",
      ),
    staleTime: 30_000,
    initialData: options?.initialData,
  });
}

export function useAdminStockCorporateActions(options?: {
  initialData?: AdminStockCorporateActionsResponse;
}) {
  return useQuery({
    queryKey: adminStockMarketKeys.corporateActions,
    queryFn: () =>
      fetchAdminStockMarket<AdminStockCorporateActionsResponse>(
        "/api/erp/admin/stocks/corporate-actions",
      ),
    staleTime: 30_000,
    initialData: options?.initialData,
  });
}
