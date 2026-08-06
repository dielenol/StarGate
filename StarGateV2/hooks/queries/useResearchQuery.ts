import { useQuery } from "@tanstack/react-query";

import type {
  ZuluSampleLabErrorCode,
  ZuluSampleLabOverview,
} from "@/lib/research/zulu-sample-lab";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export const researchKeys = {
  all: ["research"] as const,
  zulu0028: ["research", "zulu-0028"] as const,
};

export class ResearchApiError extends Error {
  readonly status: number;
  readonly code?: ZuluSampleLabErrorCode;

  constructor(
    message: string,
    status: number,
    code?: ZuluSampleLabErrorCode,
  ) {
    super(message);
    this.name = "ResearchApiError";
    this.status = status;
    this.code = code;
  }
}

export async function throwResearchError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: ZuluSampleLabErrorCode;
  };
  throw new ResearchApiError(
    body.error ?? "연구소 요청에 실패했습니다.",
    response.status,
    body.code,
  );
}

async function fetchZuluSampleLab(): Promise<ZuluSampleLabOverview> {
  const response = await fetch("/api/erp/research/zulu-0028", {
    cache: "no-store",
  });
  if (!response.ok) await throwResearchError(response);
  return response.json();
}

export function useZuluSampleLab(options?: {
  initialData?: ZuluSampleLabOverview;
  enabled?: boolean;
}) {
  const refetchInterval = useRealtimeRefetchInterval(60 * 1000);
  return useQuery({
    queryKey: researchKeys.zulu0028,
    queryFn: fetchZuluSampleLab,
    staleTime: 30 * 1000,
    initialData: options?.initialData,
    enabled: options?.enabled,
    refetchInterval,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (
        error instanceof ResearchApiError &&
        (error.status === 401 || error.status === 403 || error.status === 503)
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
