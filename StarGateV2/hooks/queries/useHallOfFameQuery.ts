import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  HallOfFameCitationPageResponse,
  HallOfFameMineResponse,
  HallOfFameNovexResponse,
  HallOfFameOverviewResponse,
  HallOfFameReportReviewResponse,
  OperationHonorCategory,
  ResearchHallOfFameResponse,
} from "@stargate/core";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export const hallOfFameKeys = {
  all: ["hall-of-fame"] as const,
  overview: ["hall-of-fame", "overview"] as const,
  research: ["hall-of-fame", "research"] as const,
  novex: ["hall-of-fame", "novex"] as const,
  citations: (category?: OperationHonorCategory) =>
    ["hall-of-fame", "citations", category ?? "all"] as const,
  citationPage: (category: OperationHonorCategory | undefined, cursor: string) =>
    ["hall-of-fame", "citations", category ?? "all", cursor] as const,
  mine: ["hall-of-fame", "mine"] as const,
  character: (characterId: string) =>
    ["hall-of-fame", "character", characterId] as const,
  report: (reportId: string) =>
    ["hall-of-fame", "report", reportId] as const,
  reportReviewState: (reportId: string) =>
    ["hall-of-fame", "report", reportId, "review-state"] as const,
};

const HALL_OF_FAME_STALE_TIME_MS = 5 * 60 * 1000;
const HALL_OF_FAME_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export class HallOfFameApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HallOfFameApiError";
    this.status = status;
  }
}

async function hallOfFameJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new HallOfFameApiError(
      body.error ?? fallbackMessage,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

async function fetchResearchHallOfFame(): Promise<ResearchHallOfFameResponse> {
  return hallOfFameJson(
    "/api/erp/hall-of-fame/research",
    "연구 공로 순위를 불러올 수 없습니다.",
  );
}

async function fetchHallOfFameOverview(): Promise<HallOfFameOverviewResponse> {
  return hallOfFameJson(
    "/api/erp/hall-of-fame/overview",
    "명예의 전당 집계를 불러올 수 없습니다.",
  );
}

async function fetchHallOfFameNovex(): Promise<HallOfFameNovexResponse> {
  return hallOfFameJson(
    "/api/erp/hall-of-fame/novex",
    "NOVEX 누적 수익 순위를 불러올 수 없습니다.",
  );
}

async function fetchHallOfFameCitations(input?: {
  category?: OperationHonorCategory;
  cursor?: string;
  characterId?: string;
  reportId?: string;
}): Promise<HallOfFameCitationPageResponse> {
  const params = new URLSearchParams();
  if (input?.category && !input.characterId && !input.reportId) {
    params.set("category", input.category);
  }
  if (input?.cursor) params.set("cursor", input.cursor);
  if (input?.characterId) params.set("characterId", input.characterId);
  if (input?.reportId) params.set("reportId", input.reportId);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return hallOfFameJson(
    `/api/erp/hall-of-fame/citations${query}`,
    "작전 공적을 불러올 수 없습니다.",
  );
}

async function fetchHallOfFameMine(): Promise<HallOfFameMineResponse> {
  return hallOfFameJson(
    "/api/erp/hall-of-fame/mine",
    "내 공적 기록을 불러올 수 없습니다.",
  );
}

async function fetchHallOfFameReportReviewState(
  reportId: string,
): Promise<HallOfFameReportReviewResponse> {
  return hallOfFameJson(
    `/api/erp/hall-of-fame/citations/status?reportId=${encodeURIComponent(reportId)}`,
    "공적 검토 상태를 불러올 수 없습니다.",
  );
}

export function useResearchHallOfFame(options?: {
  initialData?: ResearchHallOfFameResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.research,
    queryFn: fetchResearchHallOfFame,
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}

export function useHallOfFameOverview(options?: {
  initialData?: HallOfFameOverviewResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.overview,
    queryFn: fetchHallOfFameOverview,
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}

export function useHallOfFameNovex(options?: {
  initialData?: HallOfFameNovexResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.novex,
    queryFn: fetchHallOfFameNovex,
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}

export function useHallOfFameCitations(options?: {
  category?: OperationHonorCategory;
  cursor?: string;
  characterId?: string;
  reportId?: string;
  initialData?: HallOfFameCitationPageResponse;
  initialDataUpdatedAt?: number;
  enabled?: boolean;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: options?.characterId
      ? hallOfFameKeys.character(options.characterId)
      : options?.reportId
        ? hallOfFameKeys.report(options.reportId)
        : options?.cursor
          ? hallOfFameKeys.citationPage(options.category, options.cursor)
          : hallOfFameKeys.citations(options?.category),
    queryFn: () => fetchHallOfFameCitations(options),
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
    enabled: options?.enabled ?? true,
  });
}

export function useHallOfFameMine(options?: {
  initialData?: HallOfFameMineResponse;
  initialDataUpdatedAt?: number;
  enabled?: boolean;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.mine,
    queryFn: fetchHallOfFameMine,
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
    enabled: options?.enabled ?? true,
  });
}

export function useHallOfFameReportReviewState(options: {
  reportId: string;
  initialData?: HallOfFameReportReviewResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.reportReviewState(options.reportId),
    queryFn: () => fetchHallOfFameReportReviewState(options.reportId),
    staleTime: HALL_OF_FAME_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialDataUpdatedAt,
  });
}
