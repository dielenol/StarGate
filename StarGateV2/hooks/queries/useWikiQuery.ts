import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type {
  WikiPageClient,
  WikiPageSummaryConnectionClient,
} from "@/types/wiki";

export const wikiKeys = {
  all: ["wiki"] as const,
  list: (params?: { category?: string; q?: string }) =>
    ["wiki", "list", params ?? {}] as const,
  byId: (id: string) => ["wiki", "id", id] as const,
};

const WIKI_STALE_TIME_MS = 30 * 60 * 1000;

async function fetchWikiPages(params?: {
  category?: string;
  cursor?: string | null;
  limit?: number;
  q?: string;
}): Promise<WikiPageSummaryConnectionClient> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.cursor) searchParams.set("cursor", params.cursor);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.q) searchParams.set("q", params.q);

  const qs = searchParams.toString();
  const url = qs ? `/api/erp/wiki?${qs}` : "/api/erp/wiki";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("위키 페이지를 불러올 수 없습니다.");
  const data = await res.json();
  return data as WikiPageSummaryConnectionClient;
}

async function fetchWikiPageById(id: string): Promise<WikiPageClient> {
  const response = await fetch(`/api/erp/wiki/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("위키 문서를 불러올 수 없습니다.");
  }
  const data = (await response.json()) as { page: WikiPageClient };
  return data.page;
}

export function useWikiPages(
  params?: { category?: string; q?: string },
  options?: {
    enabled?: boolean;
    initialData?: WikiPageSummaryConnectionClient;
  },
) {
  return useInfiniteQuery({
    queryKey: wikiKeys.list(params),
    queryFn: ({ pageParam }) =>
      fetchWikiPages({ ...params, cursor: pageParam, limit: 20 }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: WIKI_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
    refetchOnMount: "always",
    initialData: options?.initialData
      ? { pages: [options.initialData], pageParams: [null] }
      : undefined,
  });
}

export function useWikiPage(
  id: string,
  options?: { enabled?: boolean; initialData?: WikiPageClient },
) {
  const refetchInterval = useRealtimeRefetchInterval(60_000);
  return useQuery({
    queryKey: wikiKeys.byId(id),
    queryFn: () => fetchWikiPageById(id),
    enabled: options?.enabled ?? id.length > 0,
    staleTime: WIKI_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
  });
}
