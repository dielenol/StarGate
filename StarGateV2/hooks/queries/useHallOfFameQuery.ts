import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  HallOfFameCitationPageResponse,
  HallOfFameMineResponse,
  HallOfFameNovexResponse,
  OperationHonorCategory,
  ResearchHallOfFameResponse,
} from "@stargate/core";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";

export const hallOfFameKeys = {
  all: ["hall-of-fame"] as const,
  research: ["hall-of-fame", "research"] as const,
  novex: (seasonKey?: string) =>
    ["hall-of-fame", "novex", seasonKey ?? "latest"] as const,
  citations: (category?: OperationHonorCategory) =>
    ["hall-of-fame", "citations", category ?? "all"] as const,
  citationPage: (category: OperationHonorCategory | undefined, cursor: string) =>
    ["hall-of-fame", "citations", category ?? "all", cursor] as const,
  mine: ["hall-of-fame", "mine"] as const,
  character: (characterId: string) =>
    ["hall-of-fame", "character", characterId] as const,
  report: (reportId: string) =>
    ["hall-of-fame", "report", reportId] as const,
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

async function fetchHallOfFameNovex(
  seasonKey?: string,
): Promise<HallOfFameNovexResponse> {
  const params = new URLSearchParams();
  if (seasonKey) params.set("season", seasonKey);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return hallOfFameJson(
    `/api/erp/hall-of-fame/novex${query}`,
    "NOVEX 시즌 공적을 불러올 수 없습니다.",
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

export function useHallOfFameNovex(options?: {
  seasonKey?: string;
  initialData?: HallOfFameNovexResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    HALL_OF_FAME_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: hallOfFameKeys.novex(options?.seasonKey),
    queryFn: () => fetchHallOfFameNovex(options?.seasonKey),
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
