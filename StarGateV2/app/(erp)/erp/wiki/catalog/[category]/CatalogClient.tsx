"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import type { ItemCategory } from "@stargate/shared-db";

import {
  CATALOG_TABS,
  type CatalogScope,
  ITEM_CATEGORY_LABEL,
  categoryTone,
} from "@/lib/catalog/categories";

import styles from "./CatalogClient.module.css";

type CatalogItem = {
  _id: string;
  slug?: string;
  name: string;
  category: ItemCategory;
  description: string;
  price: number | string;
  damage?: string;
  effect?: string;
  tags?: string[];
  isAvailable: boolean;
};

interface Props {
  category: CatalogScope;
  label: string;
  initialItems: CatalogItem[];
}

/**
 * 가격 문자열/숫자를 number 로 정규화. 파싱 불가 시 `null` 을 반환해
 * 호출부가 "—" 같은 명시적 미정 표기를 결정할 수 있게 한다.
 */
function toPriceNumber(price: number | string): number | null {
  if (typeof price === "number" && Number.isFinite(price)) return price;
  const parsed = Number(price);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(price: number | string): string {
  const n = toPriceNumber(price);
  return n === null ? "—" : `₩${n.toLocaleString("ko-KR")}`;
}

export default function CatalogClient({ category, label, initialItems }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "price">("name");

  // 사전 정규화: name + description + damage/effect 을 한 번만 lowercase
  // → 매 키스트로크마다 lowercase + includes 4회 호출 회피.
  const searchIndex = useMemo(
    () =>
      initialItems.map((it) => ({
        item: it,
        haystack:
          `${it.name} ${it.description} ${it.damage ?? ""} ${it.effect ?? ""} ${
            it.tags?.join(" ") ?? ""
          }`.toLowerCase(),
      })),
    [initialItems],
  );

  // 입력은 즉시 갱신 / 필터링은 deferred — N 이 커져도 입력 지연 회귀 방지.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = q
      ? searchIndex
          .filter(({ haystack }) => haystack.includes(q))
          .map(({ item }) => item)
      : initialItems.slice();

    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "ko");
      const aN = toPriceNumber(a.price);
      const bN = toPriceNumber(b.price);
      // 파싱 실패는 정렬에서 가장 끝으로 — 0 으로 silent fallback 하면 무료 아이템과 혼동.
      if (aN === null && bN === null) return 0;
      if (aN === null) return 1;
      if (bN === null) return -1;
      return aN - bN;
    });
  }, [initialItems, searchIndex, deferredQuery, sortKey]);

  return (
    <div className={styles.catalog} data-category={category}>
      <header className={styles.catalog__header}>
        <h1 className={styles.catalog__title}>{label}</h1>
        <p className={styles.catalog__meta}>
          총 {filtered.length}개 / 전체 {initialItems.length}개
        </p>
      </header>

      <nav className={styles.catalog__tabs} aria-label="카탈로그 분류">
        {CATALOG_TABS.map((tab) => {
          const isActive = tab.key === category;
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
          placeholder="이름·설명·효과로 검색"
          aria-label="이름·설명·효과 검색"
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
        <p className={styles.catalog__empty}>등록된 항목이 없습니다.</p>
      ) : (
        <ul className={styles.catalog__grid}>
          {filtered.map((it) => (
            <li
              key={it._id}
              className={[
                styles.card,
                !it.isAvailable && styles["card--unavailable"],
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* 차후 상세 페이지 추가 시 isAvailable=false 카드는 클릭 비활성 처리 필요 */}
              <div className={styles.card__header}>
                <h2 className={styles.card__name}>{it.name}</h2>
                <span
                  className={[
                    styles.card__category,
                    styles[`card__category--${categoryTone(it.category)}`],
                  ].join(" ")}
                >
                  {ITEM_CATEGORY_LABEL[it.category]}
                </span>
              </div>
              <p className={styles.card__description}>{it.description}</p>
              <dl className={styles.card__stats}>
                <div className={styles.card__stat}>
                  <dt>가격</dt>
                  <dd>{formatPrice(it.price)}</dd>
                </div>
                {it.damage && (
                  <div className={styles.card__stat}>
                    <dt>데미지</dt>
                    <dd>{it.damage}</dd>
                  </div>
                )}
                {it.effect && (
                  <div className={styles.card__stat}>
                    <dt>효과</dt>
                    <dd>{it.effect}</dd>
                  </div>
                )}
              </dl>
              {!it.isAvailable && (
                <span className={styles.card__badge}>미가용</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
