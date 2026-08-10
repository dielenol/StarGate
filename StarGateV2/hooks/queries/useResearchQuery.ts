import { useQuery } from "@tanstack/react-query";

import type {
  ResearchErrorResponse,
  ResearchLabOverview,
} from "@/types/research";

export const researchKeys = {
  all: ["research"] as const,
  overview: ["research", "overview"] as const,
};

export class ResearchApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAt?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    retryAt?: string,
  ) {
    super(message);
    this.name = "ResearchApiError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

export async function throwResearchError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ResearchErrorResponse;
  throw new ResearchApiError(
    body.error ?? "연구소 요청에 실패했습니다.",
    response.status,
    body.code,
    body.retryAt,
  );
}

async function fetchResearchLab(): Promise<ResearchLabOverview> {
  const response = await fetch("/api/erp/research", { cache: "no-store" });
  if (!response.ok) await throwResearchError(response);
  return response.json();
}

export function useResearchLab(options?: {
  initialData?: ResearchLabOverview;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: researchKeys.overview,
    queryFn: fetchResearchLab,
    initialData: options?.initialData,
    enabled: options?.enabled,
    staleTime: 15 * 1_000,
    // research_lab 컬렉션은 아직 realtime resource에 매핑되지 않았다.
    // primary WebSocket 연결 중에도 FIFO/worker 상태가 굳지 않도록 안전 폴링을 유지한다.
    refetchInterval: 60 * 1_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: (failureCount, error) => {
      if (
        error instanceof ResearchApiError &&
        (error.status === 401 || error.status === 403 || error.status === 409)
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
