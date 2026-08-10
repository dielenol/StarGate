import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import {
  getOwnedDataViewerId,
  isMemberErpViewer,
} from "@/lib/auth/guest";
import { hasRole } from "@/lib/auth/rbac";
import { searchLore } from "@/lib/db/lore-search";
import { listWikiPageSummaries } from "@/lib/db/wiki";
import type { WikiPageSummaryConnectionClient } from "@/types/wiki";
import type { LoreSearchResponseClient } from "@/hooks/queries/useLoreSearchQuery";

import WikiClient from "./WikiClient";
import { sortWikiCategories } from "./wiki-display";

interface WikiListPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

function serializeWikiConnection(
  result: Awaited<ReturnType<typeof listWikiPageSummaries>>,
): WikiPageSummaryConnectionClient {
  const serializePage = (page: (typeof result.pages)[number]) => ({
    ...page,
    _id: page._id.toString(),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  });
  return {
    ...result,
    pages: result.pages.map(serializePage),
    recent: result.recent.map(serializePage),
  };
}

function serializeLoreSearch(
  result: Awaited<ReturnType<typeof searchLore>>,
): LoreSearchResponseClient {
  return {
    ...result,
    results: result.results.map((entry) => ({
      ...entry,
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}

export default async function WikiListPage({
  searchParams,
}: WikiListPageProps) {
  const session = await getActiveSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { category, q } = await searchParams;
  const canViewPrivate = hasRole(session.user.role, "V");
  const normalizedQuery = q?.trim() ?? "";
  if (normalizedQuery.length > 120) {
    redirect(`/erp/wiki?q=${encodeURIComponent(normalizedQuery.slice(0, 120))}`);
  }

  let initialWiki: WikiPageSummaryConnectionClient = {
    pages: [],
    facets: [],
    recent: [],
    totalCount: 0,
    nextCursor: null,
  };
  let initialLore: LoreSearchResponseClient | undefined;

  try {
    const [wiki, lore] = await Promise.all([
      listWikiPageSummaries({
        category: normalizedQuery ? undefined : category,
        includePrivate: canViewPrivate,
        limit: 20,
      }),
      normalizedQuery.length >= 2
        ? searchLore(normalizedQuery, {
            userId: getOwnedDataViewerId(session.user),
            role: session.user.role,
            isAuthenticated: isMemberErpViewer(session.user),
          })
        : Promise.resolve(undefined),
    ]);
    initialWiki = serializeWikiConnection(wiki);
    initialLore = lore ? serializeLoreSearch(lore) : undefined;
  } catch {
    // 조회 실패 시 비어 있는 탐색 화면을 렌더하고 클라이언트 Query가 재시도한다.
  }

  const categories = sortWikiCategories(
    initialWiki.facets.map((facet) => facet.category),
  );

  return (
    <WikiClient
      initialWiki={initialWiki}
      initialLore={initialLore}
      categories={categories}
      currentCategory={category}
      currentQuery={normalizedQuery || undefined}
      isGM={canViewPrivate}
    />
  );
}
