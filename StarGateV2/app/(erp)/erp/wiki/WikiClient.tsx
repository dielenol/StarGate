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

import styles from "./page.module.css";

interface Props {
  initialPages: WikiPage[];
  categories: string[];
  currentCategory?: string;
  currentQuery?: string;
  isGM: boolean;
}

export default function WikiClient({
  initialPages,
  categories,
  currentCategory,
  currentQuery,
  isGM,
}: Props) {
  const { data: pages = [] } = useWikiPages(
    currentCategory || currentQuery
      ? { category: currentCategory, q: currentQuery }
      : undefined,
    { initialData: initialPages },
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of initialPages) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [initialPages]);

  const recent = useMemo(
    () =>
      [...initialPages]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [initialPages],
  );

  const totalCount = initialPages.length;
  const noFilter = !currentCategory && !currentQuery;

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
                <span>전체</span>
                <span className={styles.nav__count}>{totalCount}</span>
              </Link>
            </li>
            {categories.map((cat) => {
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
                    <span>{cat}</span>
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

          <Box>
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
                  return (
                    <Link
                      key={id}
                      href={`/erp/wiki/${id}`}
                      className={styles.item}
                    >
                      <div className={styles.item__body}>
                        <div className={styles.item__title}>{page.title}</div>
                        <div className={styles.item__meta}>
                          <Tag tone="info">{page.category}</Tag>
                          {page.tags.slice(0, 3).map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                          {!page.isPublic ? (
                            <Tag tone="danger">PRIVATE</Tag>
                          ) : null}
                        </div>
                      </div>
                      <span className={styles.item__date}>
                        {formatDate(page.updatedAt, "padded")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Box>
        </div>

        {/* ── Right: recent updates placeholder ── */}
        <Box className={`${styles.aside} ${styles.layout__aside}`}>
          <div className={styles.aside__section}>
            <Eyebrow>RECENT</Eyebrow>
            {recent.length === 0 ? (
              <span className={styles.aside__link}>—</span>
            ) : (
              <ul className={styles.aside__list}>
                {recent.map((p) => (
                  <li key={String(p._id)}>
                    <Link
                      href={`/erp/wiki/${String(p._id)}`}
                      className={styles.aside__link}
                    >
                      · {p.title}
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
