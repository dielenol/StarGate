import { useQuery } from "@tanstack/react-query";

export type StockScheduledEventStatus =
  | "PENDING"
  | "APPLIED"
  | "CANCELLED"
  | "SYSTEM";

export interface StockScheduledEventItem {
  id: string;
  ticker: string;
  stockName: string;
  kstDate: string;
  executeAt: string;
  changePercent: number;
  eventText: string;
  eventTier: "scenario" | "shock";
  status: StockScheduledEventStatus;
  source: "gm" | "built-in";
  canCancel: boolean;
  createdBy?: string;
  createdAt?: string;
}
export interface StockScheduledEventsResponse {
  items: StockScheduledEventItem[];
  nextTickDate: string;
}

export class StockScheduledEventsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StockScheduledEventsApiError";
    this.status = status;
  }
}

export const stockScheduledEventsKeys = {
  all: ["stocks", "scheduled-events"] as const,
};

export async function parseStockScheduledEventsError(
  response: Response,
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new StockScheduledEventsApiError(
    body.error ?? "주식 예약 이벤트 API 호출에 실패했습니다.",
    response.status,
  );
}

async function fetchStockScheduledEvents(): Promise<StockScheduledEventsResponse> {
  const response = await fetch("/api/erp/admin/stocks/events");
  if (!response.ok) await parseStockScheduledEventsError(response);
  return response.json();
}

export function useStockScheduledEvents() {
  return useQuery({
    queryKey: stockScheduledEventsKeys.all,
    queryFn: fetchStockScheduledEvents,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}
