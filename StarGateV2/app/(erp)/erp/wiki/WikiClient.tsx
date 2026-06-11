"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import type { WikiPageClient } from "@/types/wiki";

import { useWikiPages } from "@/hooks/queries/useWikiQuery";

import { formatDate } from "@/lib/format/date";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";
import {
  IconConcept,
  IconContainment,
  IconCoreArchive,
  IconFactionBriefing,
  IconFinance,
  IconGoods,
  IconGridAll,
  IconInstitution,
  IconInventoryConsumable,
  IconInventoryEquipment,
  IconPersonCard,
  IconPlace,
  IconRegulation,
  IconWikiFaction,
  type IconComponent,
} from "@/components/icons";

import WikiSearchBar from "./WikiSearchBar";
import {
  sortWikiCategories,
  wikiCategoryTone,
  wikiKeywordTags,
  wikiSummary,
} from "./wiki-display";

import styles from "./page.module.css";

interface Props {
  initialPages: WikiPageClient[];
  allPages: WikiPageClient[];
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
  사건: IconFactionBriefing,
  세력: IconWikiFaction,
  세션: IconFactionBriefing,
  장소: IconPlace,
  예산: IconFinance,
  규정: IconRegulation,
  작전기록: IconCoreArchive,
  "작전 보고서": IconFactionBriefing,
  인물: IconPersonCard,
  장비: IconInventoryEquipment,
  소모품: IconInventoryConsumable,
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

function searchHaystack(page: WikiPageClient): string {
  return `${page.title} ${page.content} ${page.tags?.join(" ") ?? ""}`.toLowerCase();
}

function filterWikiPages(
  pages: WikiPageClient[],
  category?: string,
  q?: string,
): WikiPageClient[] {
  const query = q?.trim().toLowerCase();
  if (query) {
    return pages
      .filter((page) => searchHaystack(page).includes(query))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 50);
  }
  if (category) return pages.filter((page) => page.category === category);
  return pages;
}

export default function WikiClient({
  initialPages,
  allPages,
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

  const sortedCategories = useMemo(
    () => sortWikiCategories(categories),
    [categories],
  );

  const seedPages = allPages.length > 0 ? allPages : initialPages;
  const { data: cachedPages = seedPages } = useWikiPages(undefined, {
    initialData: seedPages,
  });

  const activeQueryTrimmed = activeQuery.trim();

  const pages = useMemo(
    () => filterWikiPages(cachedPages, activeCategory, activeQueryTrimmed),
    [cachedPages, activeCategory, activeQueryTrimmed],
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
    const trimmed = nextQuery.trim();
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of cachedPages) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [cachedPages]);

  const recent = useMemo(
    () =>
      [...cachedPages]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [cachedPages],
  );

  const totalCount = cachedPages.length;
  const visibleCount = pages.length;
  const noFilter = !activeCategory && !activeQueryTrimmed;
  const resultTitle = activeQueryTrimmed
    ? "검색 결과"
    : activeCategory
      ? `${activeCategory} 문서`
      : "전체 문서";
  const resultSubtitle = activeQueryTrimmed
    ? `"${activeQueryTrimmed}" 검색어로 제목, 본문, 태그를 조회한 결과입니다.`
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
        right={
          isGM ? (
            <Button as="a" href="/erp/wiki/new" variant="primary">
              + 새 문서
            </Button>
          ) : null
        }
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
                <span className={styles.nav__count}>{totalCount}</span>
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

            {pages.length === 0 ? (
              <div className={styles.empty}>
                {activeQueryTrimmed
                  ? `"${activeQueryTrimmed}"에 대한 검색 결과가 없습니다.`
                  : "등록된 문서가 없습니다."}
              </div>
            ) : (
              <div className={styles.list}>
                {pages.map((page) => {
                  const id = String(page._id);
                  const summary = wikiSummary(page.content);
                  const keywordTags = wikiKeywordTags(page);
                  return (
                    <Link
                      key={id}
                      href={`/erp/wiki/${id}`}
                      className={styles.item}
                    >
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
                        <p className={styles.item__summary}>{summary}</p>
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
              </div>
            )}
          </Box>
        </div>

        <Box className={`${styles.aside} ${styles.layout__aside}`}>
          <div className={styles.aside__section}>
            <h2 className={styles.aside__title}>문서 현황</h2>
            <dl className={styles.stats}>
              <div>
                <dt>전체</dt>
                <dd>{totalCount}</dd>
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
