"use client";

import { useMemo } from "react";

import Link from "next/link";

import type { WikiPage } from "@/types/wiki";

import { useWikiPages } from "@/hooks/queries/useWikiQuery";

import { formatDate } from "@/lib/format/date";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import WikiSearchBar from "./WikiSearchBar";
import {
  sortWikiCategories,
  wikiCategoryTone,
  wikiKeywordTags,
  wikiSummary,
} from "./wiki-display";

import styles from "./page.module.css";

interface Props {
  initialPages: WikiPage[];
  allPages: WikiPage[];
  categories: string[];
  currentCategory?: string;
  currentQuery?: string;
  isGM: boolean;
}

export default function WikiClient({
  initialPages,
  allPages,
  categories,
  currentCategory,
  currentQuery,
  isGM,
}: Props) {
  const sortedCategories = useMemo(
    () => sortWikiCategories(categories),
    [categories],
  );

  const { data: pages = [] } = useWikiPages(
    currentCategory || currentQuery
      ? { category: currentCategory, q: currentQuery }
      : undefined,
    { initialData: initialPages },
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allPages) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [allPages]);

  const recent = useMemo(
    () =>
      [...allPages]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [allPages],
  );

  const totalCount = allPages.length;
  const visibleCount = pages.length;
  const noFilter = !currentCategory && !currentQuery;
  const resultTitle = currentQuery
    ? "검색 결과"
    : currentCategory
      ? `${currentCategory} 문서`
      : "전체 문서";
  const resultSubtitle = currentQuery
    ? `"${currentQuery}" 검색어로 제목, 본문, 태그를 조회한 결과입니다.`
    : currentCategory
      ? `${currentCategory} 카테고리에 등록된 문서만 표시합니다.`
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
        {/* ── Left: category nav ── */}
        <Box className={styles.nav}>
          <Eyebrow>CATEGORIES</Eyebrow>
          <ul className={styles.nav__list}>
            <li>
              <Link
                href="/erp/wiki"
                className={[
                  styles.nav__item,
                  noFilter ? styles["nav__item--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={noFilter ? "page" : undefined}
              >
                <span className={styles.nav__label}>
                  <span className={styles.nav__marker} />
                  <span>전체</span>
                </span>
                <span className={styles.nav__count}>{totalCount}</span>
              </Link>
            </li>
            {sortedCategories.map((cat) => {
              const active = currentCategory === cat;
              return (
                <li key={cat}>
                  <Link
                    href={`/erp/wiki?category=${encodeURIComponent(cat)}`}
                    className={[
                      styles.nav__item,
                      active ? styles["nav__item--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.nav__label}>
                      <span className={styles.nav__marker} />
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

        {/* ── Center: search + article list ── */}
        <div className={styles.body}>
          <WikiSearchBar />

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

            {currentCategory || currentQuery ? (
              <div className={styles.filterBar}>
                <span className={styles.filterBar__label}>현재 필터</span>
                {currentCategory ? (
                  <Tag tone={wikiCategoryTone(currentCategory)}>
                    {currentCategory}
                  </Tag>
                ) : null}
                {currentQuery ? <Tag tone="info">{currentQuery}</Tag> : null}
                <Link href="/erp/wiki" className={styles.filterBar__clear}>
                  필터 해제
                </Link>
              </div>
            ) : null}

            {pages.length === 0 ? (
              <div className={styles.empty}>
                {currentQuery
                  ? `"${currentQuery}"에 대한 검색 결과가 없습니다.`
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

        {/* ── Right: index stats + recent updates ── */}
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
              <span className={styles.aside__link}>—</span>
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
