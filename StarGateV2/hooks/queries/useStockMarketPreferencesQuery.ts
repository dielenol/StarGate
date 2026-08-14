import { useQuery } from "@tanstack/react-query";

export type StockMarketAlertKind =
  | "BELOW_PRICE"
  | "MOVE_PERCENT"
  | "DISCLOSURE";

export interface StockMarketAlertRule {
  id: string;
  ticker: string;
  kind: StockMarketAlertKind;
  threshold?: number;
  enabled: boolean;
}

export interface StockMarketPreferenceResponse {
  novexEnabled: boolean;
  watchlist: string[];
  alerts: StockMarketAlertRule[];
  migratedLocalStorageAt: string | null;
}

export class StockMarketPreferencesApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StockMarketPreferencesApiError";
    this.status = status;
  }
}

export const stockMarketPreferenceKeys = {
  all: ["stocks", "preferences"] as const,
  update: ["stocks", "preferences", "update"] as const,
};

export async function parseStockMarketPreferencesError(
  response: Response,
): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new StockMarketPreferencesApiError(
    body.error ?? "주식 설정 API 호출에 실패했습니다.",
    response.status,
  );
}

async function fetchStockMarketPreferences(): Promise<StockMarketPreferenceResponse> {
  const response = await fetch("/api/erp/stocks/preferences", {
    cache: "no-store",
  });
  if (!response.ok) await parseStockMarketPreferencesError(response);
  return response.json();
}

export function useStockMarketPreferences(options?: {
  initialData?: StockMarketPreferenceResponse;
}) {
  return useQuery({
    queryKey: stockMarketPreferenceKeys.all,
    queryFn: fetchStockMarketPreferences,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
  });
}
