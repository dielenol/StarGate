"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LoreRecordStatus } from "@stargate/shared-db/types";

import Link from "next/link";

import type {
  WikiPageSummaryClient,
  WikiPageSummaryConnectionClient,
} from "@/types/wiki";

import { useWikiPages } from "@/hooks/queries/useWikiQuery";
import {
  useLoreSearch,
  type LoreSearchKind,
  type LoreSearchResponseClient,
} from "@/hooks/queries/useLoreSearchQuery";

import { formatDate } from "@/lib/format/date";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";
import {
  IconBriefing,
  IconConcept,
  IconConsumable,
  IconContainment,
  IconCoreArchive,
  IconFinance,
  IconGoods,
  IconGridAll,
  IconInstitution,
  IconInventoryEquipment,
  IconPersonCard,
  IconPlace,
  IconRegulation,
  IconWikiFaction,
  type IconComponent,
} from "@/components/icons";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";

import WikiSearchBar from "./WikiSearchBar";
import {
  sortWikiCategories,
  wikiCategoryTone,
} from "./wiki-display";

import styles from "./page.module.css";

interface Props {
  /** 서버 초기 로드 — 본문 전문 없이 첫 page/facet/recent만 Query 캐시에 시드한다. */
  initialWiki: WikiPageSummaryConnectionClient;
  initialLore?: LoreSearchResponseClient;
  categories: string[];
  currentCategory?: string;
  currentQuery?: string;
  isGM: boolean;
}

function wikiListHref(category?: string, q?: string): string {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  else if (category) params.set("category", category);
  const qs = params.toString();
  return qs ? `/erp/wiki?${qs}` : "/erp/wiki";
}

function pushWikiListUrl(category?: string, q?: string): void {
  window.history.pushState(null, "", wikiListHref(category, q));
}

const WIKI_CATEGORY_ICONS: Record<string, IconComponent> = {
  개념: IconConcept,
  개체: IconContainment,
  줄루: IconContainment,
  기관: IconInstitution,
  사건: IconBriefing,
  세력: IconWikiFaction,
  세션: IconBriefing,
  장소: IconPlace,
  예산: IconFinance,
  규정: IconRegulation,
  작전기록: IconCoreArchive,
  "작전 보고서": IconBriefing,
  인물: IconPersonCard,
  장비: IconInventoryEquipment,
  소모품: IconConsumable,
  물품: IconGoods,
};

function iconForWikiCategory(category: string): IconComponent {
  return (
    WIKI_CATEGORY_ICONS[category] ??
    WIKI_CATEGORY_ICONS[category.replace(/\s+/g, "")] ??
    IconGoods
  );
}

function shouldUseClientNavigation(
  event: React.MouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

const LORE_KIND_LABELS: Record<LoreSearchKind, string> = {
  wiki: "WIKI",
  report: "REPORT",
  personnel: "DOSSIER",
  catalog: "CATALOG",
  faction: "FACTION",
  institution: "INSTITUTION",
};

const LORE_STATUS_LABELS: Partial<Record<LoreRecordStatus, string>> = {
  "canon-from-source": "CANON",
  "session-confirmed": "SESSION",
};

function tagsForSummary(page: WikiPageSummaryClient): string[] {
  return page.tags.filter((tag) => tag.trim()).slice(0, 4);
}

export default function WikiClient({
  initialWiki,
  initialLore,
  categories,
  currentCategory,
  currentQuery,
  isGM,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | undefined>(
    currentQuery ? undefined : currentCategory,
  );
  const [activeQuery, setActiveQuery] = useState(currentQuery ?? "");

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const nextQuery = params.get("q") ?? "";
      setActiveQuery(nextQuery);
      setActiveCategory(
        nextQuery ? undefined : (params.get("category") ?? undefined),
      );
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const activeQueryTrimmed = activeQuery.trim();
  const initialCategory = currentQuery ? undefined : currentCategory;
  const canUseInitialWiki =
    !activeQueryTrimmed && activeCategory === initialCategory;
  const wikiQuery = useWikiPages(
    activeCategory ? { category: activeCategory } : undefined,
    {
      enabled: !activeQueryTrimmed,
      initialData: canUseInitialWiki ? initialWiki : undefined,
    },
  );
  const loreQuery = useLoreSearch(activeQueryTrimmed, {
    initialData:
      activeQueryTrimmed === currentQuery?.trim() ? initialLore : undefined,
  });
  const wikiConnections = useMemo(
    () =>
      wikiQuery.data?.pages ?? (canUseInitialWiki ? [initialWiki] : []),
    [canUseInitialWiki, initialWiki, wikiQuery.data?.pages],
  );
  const pages = useMemo(
    () => wikiConnections.flatMap((connection) => connection.pages),
    [wikiConnections],
  );
  const currentWiki = wikiConnections[0] ?? initialWiki;
  const loreResults = loreQuery.data?.results ?? [];
  const sortedCategories = useMemo(
    () =>
      sortWikiCategories([
        ...new Set([
          ...categories,
          ...currentWiki.facets.map((facet) => facet.category),
        ]),
      ]),
    [categories, currentWiki.facets],
  );

  const handleCategoryNav = useCallback(
    (nextCategory?: string) =>
      (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!shouldUseClientNavigation(event)) return;
        event.preventDefault();
        setActiveCategory(nextCategory);
        setActiveQuery("");
        pushWikiListUrl(nextCategory);
      },
    [],
  );

  const handleSearch = useCallback((nextQuery: string) => {
    const trimmed = nextQuery.trim().slice(0, 120);
    setActiveQuery(trimmed);
    if (trimmed) {
      setActiveCategory(undefined);
      pushWikiListUrl(undefined, trimmed);
    } else {
      pushWikiListUrl(undefined);
    }
  }, []);

  const handleClearFilter = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!shouldUseClientNavigation(event)) return;
      event.preventDefault();
      setActiveCategory(undefined);
      setActiveQuery("");
      pushWikiListUrl(undefined);
    },
    [],
  );

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        currentWiki.facets.map((facet) => [facet.category, facet.count]),
      ) as Record<string, number>,
    [currentWiki.facets],
  );
  const recent = currentWiki.recent;
  const totalAvailable = currentWiki.facets.reduce(
    (sum, facet) => sum + facet.count,
    0,
  );
  const totalCount = activeQueryTrimmed
    ? loreResults.length
    : currentWiki.totalCount;
  const visibleCount = activeQueryTrimmed ? loreResults.length : pages.length;
  const noFilter = !activeCategory && !activeQueryTrimmed;
  const resultTitle = activeQueryTrimmed
    ? "Lore Explorer"
    : activeCategory
      ? `${activeCategory} 문서`
      : "전체 문서";
  const resultSubtitle = activeQueryTrimmed
    ? `"${activeQueryTrimmed}"와 연결된 위키·보고서·Dossier·카탈로그·조직 기록입니다.`
    : activeCategory
      ? `${activeCategory} 카테고리에 등록된 문서만 표시합니다.`
      : "공개 위키와 내부 문서 전체를 카테고리 기준으로 탐색합니다.";

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "CODEX" },
        ]}
        title="위키"
      />

      <div className={styles.layout}>
        <Box className={styles.nav}>
          <Eyebrow>CATEGORIES</Eyebrow>
          <ul className={styles.nav__list}>
            <li>
              <Link
                href="/erp/wiki"
                onClick={handleCategoryNav(undefined)}
                className={[
                  styles.nav__item,
                  noFilter ? styles["nav__item--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={noFilter ? "page" : undefined}
              >
                <span className={styles.nav__label}>
                  <IconGridAll className={styles.nav__icon} aria-hidden />
                  <span>전체</span>
                </span>
                <span className={styles.nav__count}>{totalAvailable}</span>
              </Link>
            </li>
            {sortedCategories.map((cat) => {
              const active = activeCategory === cat;
              const CategoryIcon = iconForWikiCategory(cat);
              return (
                <li key={cat}>
                  <Link
                    href={wikiListHref(cat)}
                    onClick={handleCategoryNav(cat)}
                    className={[
                      styles.nav__item,
                      active ? styles["nav__item--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.nav__label}>
                      <CategoryIcon className={styles.nav__icon} aria-hidden />
                      <span>{cat}</span>
                    </span>
                    <span className={styles.nav__count}>
                      {categoryCounts[cat] ?? 0}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Box>

        <div className={styles.body}>
          <WikiSearchBar value={activeQuery} onSearch={handleSearch} />

          <Box className={styles.index}>
            <div className={styles.index__head}>
              <div>
                <Eyebrow tone="gold">DOCUMENT INDEX</Eyebrow>
                <h2 className={styles.index__title}>{resultTitle}</h2>
                <p className={styles.index__subtitle}>{resultSubtitle}</p>
              </div>
              <div className={styles.index__count}>
                <span>{visibleCount}</span>
                <small>/ {totalCount}</small>
              </div>
            </div>

            {activeCategory || activeQueryTrimmed ? (
              <div className={styles.filterBar}>
                <span className={styles.filterBar__label}>현재 필터</span>
                {activeCategory ? (
                  <Tag tone={wikiCategoryTone(activeCategory)}>
                    {activeCategory}
                  </Tag>
                ) : null}
                {activeQueryTrimmed ? (
                  <Tag tone="info">{activeQueryTrimmed}</Tag>
                ) : null}
                <Link
                  href="/erp/wiki"
                  className={styles.filterBar__clear}
                  onClick={handleClearFilter}
                >
                  필터 해제
                </Link>
              </div>
            ) : null}

            {activeQueryTrimmed.length >= 2 &&
            (loreQuery.data?.degradedSources.length ?? 0) > 0 ? (
              <div className={styles.searchWarning} role="status">
                일부 기록원({loreQuery.data?.degradedSources.join(", ")})을
                조회하지 못했습니다. 표시된 결과는 부분 결과입니다.
              </div>
            ) : null}

            {activeQueryTrimmed.length === 1 ? (
              <div className={styles.empty}>검색어를 2자 이상 입력해 주세요.</div>
            ) : activeQueryTrimmed && loreQuery.isError ? (
              <div className={styles.empty} role="alert">
                로어 기록을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.
                <div className={styles.empty__action}>
                  <Button size="sm" onClick={() => loreQuery.refetch()}>
                    다시 시도
                  </Button>
                </div>
              </div>
            ) : (activeQueryTrimmed ? loreQuery.isLoading : wikiQuery.isLoading) ? (
              <div className={styles.empty}>기록을 조회하고 있습니다.</div>
            ) : (activeQueryTrimmed ? loreResults.length : pages.length) === 0 ? (
              <div className={styles.empty}>
                {activeQueryTrimmed
                  ? `"${activeQueryTrimmed}"에 대한 검색 결과가 없습니다.`
                  : "등록된 문서가 없습니다."}
              </div>
            ) : (
              <div className={styles.list}>
                {activeQueryTrimmed
                  ? loreResults.map((result) => (
                    <Link
                      key={`${result.kind}:${result.key}`}
                      href={result.href}
                      className={styles.item}
                    >
                      <LinkPendingProbe />
                      <div className={styles.item__body}>
                        <div className={styles.item__head}>
                          <Tag tone="info">
                            {LORE_KIND_LABELS[result.kind]}
                          </Tag>
                          <Tag tone={wikiCategoryTone(result.category)}>
                            {result.category}
                          </Tag>
                          {result.status ? (
                            <Tag
                              tone={
                                result.status === "session-confirmed"
                                  ? "success"
                                  : "gold"
                              }
                            >
                              {LORE_STATUS_LABELS[result.status] ?? result.status}
                            </Tag>
                          ) : null}
                          {!result.isPublic ? (
                            <Tag tone="danger">PRIVATE</Tag>
                          ) : null}
                        </div>
                        <div className={styles.item__title}>{result.title}</div>
                        <p className={styles.item__summary}>{result.excerpt}</p>
                        {result.tags.length > 0 ? (
                          <div className={styles.item__meta}>
                            {result.tags.slice(0, 4).map((tag) => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className={styles.item__dateBlock}>
                        <span>수정</span>
                        <b>{formatDate(result.updatedAt, "padded")}</b>
                      </span>
                    </Link>
                  ))
                  : pages.map((page) => {
                      const id = String(page._id);
                      const keywordTags = tagsForSummary(page);
                      return (
                        <Link
                          key={id}
                          href={`/erp/wiki/${id}`}
                          className={styles.item}
                        >
                          <LinkPendingProbe />
                          <div className={styles.item__body}>
                            <div className={styles.item__head}>
                              <Tag tone={wikiCategoryTone(page.category)}>
                                {page.category}
                              </Tag>
                              {!page.isPublic ? (
                                <Tag tone="danger">PRIVATE</Tag>
                              ) : null}
                            </div>
                            <div className={styles.item__title}>{page.title}</div>
                            <p className={styles.item__summary}>{page.excerpt}</p>
                            {keywordTags.length > 0 ? (
                              <div className={styles.item__meta}>
                                {keywordTags.map((tag) => (
                                  <Tag key={tag}>{tag}</Tag>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <span className={styles.item__dateBlock}>
                            <span>수정</span>
                            <b>{formatDate(page.updatedAt, "padded")}</b>
                          </span>
                        </Link>
                      );
                    })}
                {!activeQueryTrimmed && wikiQuery.hasNextPage ? (
                  <div className={styles.loadMore}>
                    <Button
                      type="button"
                      disabled={wikiQuery.isFetchingNextPage}
                      onClick={() => void wikiQuery.fetchNextPage()}
                    >
                      {wikiQuery.isFetchingNextPage
                        ? "불러오는 중"
                        : "문서 더 보기"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Box>
        </div>

        <Box className={`${styles.aside} ${styles.layout__aside}`}>
          <div className={styles.aside__section}>
            <div className={styles.aside__titleRow}>
              <h2 className={styles.aside__title}>문서 현황</h2>
              {isGM ? (
                <Button
                  as="a"
                  href="/erp/wiki/new"
                  size="sm"
                  className={styles.aside__action}
                >
                  + 새 문서
                </Button>
              ) : null}
            </div>
            <dl className={styles.stats}>
              <div>
                <dt>전체</dt>
                <dd>{totalAvailable}</dd>
              </div>
              <div>
                <dt>표시</dt>
                <dd>{visibleCount}</dd>
              </div>
              <div>
                <dt>분류</dt>
                <dd>{sortedCategories.length}</dd>
              </div>
            </dl>
          </div>

          <div className={styles.aside__section}>
            <h2 className={styles.aside__title}>최근 갱신 문서</h2>
            {recent.length === 0 ? (
              <span className={styles.aside__link}>-</span>
            ) : (
              <ul className={styles.aside__list}>
                {recent.map((p) => (
                  <li key={String(p._id)}>
                    <Link
                      href={`/erp/wiki/${String(p._id)}`}
                      className={styles.recentLink}
                    >
                      <LinkPendingProbe />
                      <span className={styles.recentLink__category}>
                        {p.category}
                      </span>
                      <span className={styles.recentLink__title}>
                        {p.title}
                      </span>
                      <span className={styles.recentLink__date}>
                        {formatDate(p.updatedAt, "padded")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Box>
      </div>
    </>
  );
}
