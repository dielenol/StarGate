import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { WikiPageClient } from "@/types/wiki";

export const wikiKeys = {
  all: ["wiki"] as const,
  list: (params?: { category?: string; q?: string }) =>
    ["wiki", "list", params ?? {}] as const,
  byId: (id: string) => ["wiki", "id", id] as const,
};

const WIKI_STALE_TIME_MS = 30 * 60 * 1000;

async function fetchWikiPages(params?: {
  category?: string;
  q?: string;
}): Promise<WikiPageClient[]> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set("category", params.category);
  if (params?.q) searchParams.set("q", params.q);

  const qs = searchParams.toString();
  const url = qs ? `/api/erp/wiki?${qs}` : "/api/erp/wiki";

  const res = await fetch(url);
  if (!res.ok) throw new Error("위키 페이지를 불러올 수 없습니다.");
  const data = await res.json();
  return data.pages;
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
  options?: { initialData?: WikiPageClient[] },
) {
  return useQuery({
    queryKey: wikiKeys.list(params),
    queryFn: () => fetchWikiPages(params),
    staleTime: WIKI_STALE_TIME_MS,
    initialData: options?.initialData,
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
