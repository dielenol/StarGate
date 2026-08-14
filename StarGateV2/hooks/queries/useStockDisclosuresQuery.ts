import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export type StockDisclosureStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHED"
  | "CANCELLED";

export interface StockDisclosureEffect {
  scope: "MARKET" | "TICKER";
  ticker?: string;
  changePercent?: number;
  structural: boolean;
}

export interface StockDisclosureItem {
  id: string;
  status: StockDisclosureStatus;
  /** 공개 전 플레이어 응답에서는 공시 유형도 숨긴다. GM/공개 완료 응답에만 존재한다. */
  kind?: "INFO" | "PRICE";
  scope: "MARKET" | "TICKERS";
  tickers: string[];
  publishAt: string;
  headline?: string;
  body?: string;
  effects?: StockDisclosureEffect[];
  createdBy?: string;
  canEdit: boolean;
  canCancel: boolean;
}

export interface StockDisclosuresResponse {
  items: StockDisclosureItem[];
  generatedAt: string;
}

export class StockDisclosuresApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StockDisclosuresApiError";
    this.status = status;
  }
}

export const stockDisclosureKeys = {
  all: ["stocks", "disclosures"] as const,
  public: ["stocks", "disclosures", "public"] as const,
  admin: ["stocks", "disclosures", "admin"] as const,
};

export async function parseStockDisclosuresError(
  response: Response,
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new StockDisclosuresApiError(
    body.error ?? "주식 공시 API 호출에 실패했습니다.",
    response.status,
  );
}

async function fetchStockDisclosures(
  endpoint: string,
): Promise<StockDisclosuresResponse> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) await parseStockDisclosuresError(response);
  return response.json();
}

export function useStockDisclosures(options?: {
  initialData?: StockDisclosuresResponse;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: stockDisclosureKeys.public,
    queryFn: () => fetchStockDisclosures("/api/erp/stocks/disclosures"),
    staleTime: 60_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}

export function useAdminStockDisclosures(options?: {
  initialData?: StockDisclosuresResponse;
}) {
  return useQuery({
    queryKey: stockDisclosureKeys.admin,
    queryFn: () => fetchStockDisclosures("/api/erp/admin/stocks/disclosures"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}
