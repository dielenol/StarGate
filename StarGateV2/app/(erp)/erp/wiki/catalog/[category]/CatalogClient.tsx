"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { MasterItem } from "@/types/inventory";

import { useInventoryItems } from "@/hooks/queries/useInventoryQuery";

import {
  CATALOG_SCOPE_CATEGORIES,
  CATALOG_SCOPE_HREF,
  CATALOG_SCOPE_TITLE,
  CATALOG_TABS,
  ITEM_CATEGORY_LABEL,
  type CatalogScope,
  categoryTone,
  normalizeCatalogScope,
} from "@/lib/catalog/categories";
import { getShopItemImageSrc } from "@/lib/shop/item-images";

import styles from "./CatalogClient.module.css";

type CatalogItem = Omit<MasterItem, "_id" | "createdAt" | "updatedAt"> & {
  _id?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

interface Props {
  category: CatalogScope;
  initialItems: CatalogItem[];
}

function toPriceNumber(price: number | string): number | null {
  if (typeof price === "number" && Number.isFinite(price)) return price;
  const parsed = Number(price);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(price: number | string): string {
  const n = toPriceNumber(price);
  return n === null ? "미정" : `¤ ${n.toLocaleString("ko-KR")}`;
}

function itemId(item: CatalogItem): string {
  const rawId = item._id as unknown;
  if (typeof rawId === "string" && rawId.trim()) return rawId;
  if (rawId && typeof rawId === "object" && "toString" in rawId) {
    const parsed = String(rawId);
    if (parsed && parsed !== "[object Object]") return parsed;
  }
  return item.slug || item.name;
}

function itemDetailHref(item: CatalogItem): string {
  return `/erp/wiki/catalog/item/${encodeURIComponent(item.slug || itemId(item))}`;
}

function assetImageSrc(value?: string): string | null {
  const src = value?.trim();
  if (!src || !src.startsWith("/assets/")) return null;
  return src;
}

function itemImageSrc(item: CatalogItem): string | null {
  return (
    assetImageSrc(item.previewImage) ??
    getShopItemImageSrc(item.slug ?? "") ??
    null
  );
}

function scopeFromPathname(pathname: string): CatalogScope | null {
  const lastSegment = pathname.split("/").filter(Boolean).at(-1);
  return lastSegment ? normalizeCatalogScope(lastSegment) : null;
}

function shouldUseClientNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export default function CatalogClient({ category, initialItems }: Props) {
  const [activeScope, setActiveScope] = useState<CatalogScope>(category);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "price">("name");

  const { data: items = initialItems } = useInventoryItems({
    initialData: initialItems as MasterItem[],
  });
  const catalogItems = items as CatalogItem[];

  const deferredQuery = useDeferredValue(query);
  const activeCategories = CATALOG_SCOPE_CATEGORIES[activeScope];

  const visibleItems = useMemo(
    () => catalogItems.filter((item) => activeCategories.includes(item.category)),
    [catalogItems, activeCategories],
  );

  const searchIndex = useMemo(
    () =>
      visibleItems.map((item) => ({
        item,
        haystack:
          `${item.name} ${item.description} ${item.damage ?? ""} ${item.effect ?? ""} ${
            item.tags?.join(" ") ?? ""
          }`.toLowerCase(),
      })),
    [visibleItems],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = q
      ? searchIndex
          .filter(({ haystack }) => haystack.includes(q))
          .map(({ item }) => item)
      : visibleItems.slice();

    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
      const aN = toPriceNumber(a.price);
      const bN = toPriceNumber(b.price);
      if (aN === null && bN === null) return 0;
      if (aN === null) return 1;
      if (bN === null) return -1;
      return aN - bN;
    });
  }, [visibleItems, searchIndex, deferredQuery, sortKey]);

  useEffect(() => {
    function handlePopState() {
      setActiveScope(scopeFromPathname(window.location.pathname) ?? "all");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleTabClick(
    scope: CatalogScope,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (!shouldUseClientNavigation(event)) return;
    event.preventDefault();
    setActiveScope(scope);
    window.history.pushState(null, "", CATALOG_SCOPE_HREF[scope]);
  }

  return (
    <div className={styles.catalog} data-category={activeScope}>
      <header className={styles.catalog__header}>
        <h1 className={styles.catalog__title}>
          {CATALOG_SCOPE_TITLE[activeScope]}
        </h1>
        <p className={styles.catalog__meta}>
          총 {filtered.length}개 / 전체 {visibleItems.length}개
        </p>
      </header>

      <nav className={styles.catalog__tabs} aria-label="카탈로그 분류">
        {CATALOG_TABS.map((tab) => {
          const isActive = tab.key === activeScope;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                styles.catalog__tab,
                isActive ? styles["catalog__tab--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => handleTabClick(tab.key, event)}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.catalog__controls}>
        <label className={styles.visuallyHidden} htmlFor="catalog-search">
          검색
        </label>
        <input
          id="catalog-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름/설명/효과 검색"
          aria-label="이름/설명/효과 검색"
          className={styles.catalog__search}
        />
        <label className={styles.visuallyHidden} htmlFor="catalog-sort">
          정렬
        </label>
        <select
          id="catalog-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as "name" | "price")}
          aria-label="정렬 기준"
          className={styles.catalog__sort}
        >
          <option value="name">이름순</option>
          <option value="price">가격순</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.catalog__empty}>조건에 맞는 품목이 없습니다.</p>
      ) : (
        <ul className={styles.catalog__grid}>
          {filtered.map((item) => {
            const imageSrc = itemImageSrc(item);
            return (
              <li key={itemId(item)}>
                <Link
                  href={itemDetailHref(item)}
                  className={[
                    styles.card,
                    !item.isAvailable && styles["card--unavailable"],
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.card__media}>
                    {imageSrc ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageSrc}
                          alt=""
                          aria-hidden
                          draggable={false}
                        />
                      </>
                    ) : (
                      <span
                        className={styles.card__mediaPlaceholder}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className={styles.card__header}>
                    <h2 className={styles.card__name}>{item.name}</h2>
                    <span
                      className={[
                        styles.card__category,
                        styles[`card__category--${categoryTone(item.category)}`],
                      ].join(" ")}
                    >
                      {ITEM_CATEGORY_LABEL[item.category]}
                    </span>
                  </div>
                  <p className={styles.card__description}>
                    {item.description}
                  </p>
                  <dl className={styles.card__stats}>
                    <div className={styles.card__stat}>
                      <dt>가격</dt>
                      <dd>{formatPrice(item.price)}</dd>
                    </div>
                    {item.damage ? (
                      <div className={styles.card__stat}>
                        <dt>대미지</dt>
                        <dd>{item.damage}</dd>
                      </div>
                    ) : null}
                    {item.effect ? (
                      <div className={styles.card__stat}>
                        <dt>효과</dt>
                        <dd>{item.effect}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {!item.isAvailable ? (
                    <span className={styles.card__badge}>미판매</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
