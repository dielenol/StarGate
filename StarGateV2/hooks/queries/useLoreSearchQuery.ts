import { useQuery } from "@tanstack/react-query";
import type { LoreRecordStatus } from "@stargate/shared-db/types";

import { wikiKeys } from "./useWikiQuery";

export type LoreSearchKind =
  | "wiki"
  | "report"
  | "personnel"
  | "catalog"
  | "faction"
  | "institution";

export type LoreSearchDegradedSource = "index" | LoreSearchKind;

export interface LoreSearchResultClient {
  kind: LoreSearchKind;
  key: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  href: string;
  isPublic: boolean;
  updatedAt: string;
  source: "index" | "fallback";
  status?: LoreRecordStatus;
}

export interface LoreSearchResponseClient {
  results: LoreSearchResultClient[];
  sourceMode: "index" | "fallback" | "hybrid";
  degradedSources: LoreSearchDegradedSource[];
}

export const loreSearchKeys = {
  // 위키 create/update/delete의 기존 wikiKeys.all invalidation에 통합 검색도 포함된다.
  all: [...wikiKeys.all, "lore-search"] as const,
  search: (query: string) => [...wikiKeys.all, "lore-search", query] as const,
};

async function fetchLoreSearch(query: string): Promise<LoreSearchResponseClient> {
  const response = await fetch(
    `/api/erp/lore/search?q=${encodeURIComponent(query)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("로어 통합 검색 결과를 불러올 수 없습니다.");
  }
  return (await response.json()) as LoreSearchResponseClient;
}

export function useLoreSearch(
  query: string,
  options?: { initialData?: LoreSearchResponseClient },
) {
  const normalized = query.trim().slice(0, 120);
  return useQuery({
    queryKey: loreSearchKeys.search(normalized),
    queryFn: () => fetchLoreSearch(normalized),
    enabled: normalized.length >= 2,
    initialData: options?.initialData,
    // report/character/catalog mutations live in separate query-key families.
    // Treat explorer data as immediately stale so returning to the page always
    // re-reads the live SSOT/fallback instead of keeping a 10-minute snapshot.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
