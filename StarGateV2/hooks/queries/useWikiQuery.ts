import { useQuery } from "@tanstack/react-query";

import type { WikiPage } from "@/types/wiki";

export const wikiKeys = {
  all: ["wiki"] as const,
  list: (params?: { category?: string; q?: string }) =>
    ["wiki", "list", params ?? {}] as const,
};

async function fetchWikiPages(params?: {
  category?: string;
  q?: string;
}): Promise<WikiPage[]> {
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

export function useWikiPages(
  params?: { category?: string; q?: string },
  options?: { initialData?: WikiPage[] },
) {
  return useQuery({
    queryKey: wikiKeys.list(params),
    queryFn: () => fetchWikiPages(params),
    staleTime: 5 * 60 * 1000,
    initialData: options?.initialData,
  });
}
