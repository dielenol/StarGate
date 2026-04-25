"use client";

import { useMemo } from "react";
import Link from "next/link";

import type { ItemCategory, MasterItem } from "@/types/inventory";

import { useInventoryItems } from "@/hooks/queries/useInventoryQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Spread from "@/components/ui/Spread/Spread";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

const CATEGORY_META: Record<
  ItemCategory,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  WEAPON: { label: "무기", tone: "danger" },
  ARMOR: { label: "방어구", tone: "info" },
  CONSUMABLE: { label: "소모품", tone: "success" },
  MATERIAL: { label: "재료", tone: "default" },
  SPECIAL: { label: "특수", tone: "gold" },
};

const CATEGORY_FILTERS: { value: ItemCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
  { value: "CONSUMABLE", label: "소모품" },
  { value: "MATERIAL", label: "재료" },
  { value: "SPECIAL", label: "특수" },
];

function formatPrice(price: MasterItem["price"]): string {
  if (typeof price === "number") {
    return price.toLocaleString();
  }
  const trimmed = price.trim();
  if (!trimmed) return "-";
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== ""
    ? numeric.toLocaleString()
    : trimmed;
}

interface Props {
  initialItems: MasterItem[];
  categoryFilter: ItemCategory | null;
  isGm: boolean;
}

export default function InventoryClient({
  initialItems,
  categoryFilter,
  isGm,
}: Props) {
  const { data: allItems = [] } = useInventoryItems({
    initialData: initialItems,
  });

  const items = useMemo(
    () =>
      categoryFilter
        ? allItems.filter((item) => item.category === categoryFilter)
        : allItems,
    [allItems, categoryFilter],
  );

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "EQUIPMENT" },
        ]}
        title="장비"
        right={
          isGm ? (
            <Button as="a" href="/erp/inventory/items/new" variant="primary">
              + 아이템 추가
            </Button>
          ) : null
        }
      />

      <nav className={styles.filters} aria-label="아이템 카테고리 필터">
        {CATEGORY_FILTERS.map((cat) => {
          const isActive =
            cat.value === "ALL"
              ? !categoryFilter
              : categoryFilter === cat.value;
          const href =
            cat.value === "ALL"
              ? "/erp/inventory"
              : `/erp/inventory?category=${cat.value}`;
          const count =
            cat.value === "ALL"
              ? allItems.length
              : allItems.filter((i) => i.category === cat.value).length;

          return (
            <Link
              key={cat.value}
              href={href}
              className={[
                styles.filters__tab,
                isActive ? styles["filters__tab--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isActive ? "page" : undefined}
            >
              {cat.label} · {count}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <Box>
          <div className={styles.empty}>등록된 아이템이 없습니다.</div>
        </Box>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => {
            const meta = CATEGORY_META[item.category];
            return (
              <Box key={String(item._id)} className={styles.card}>
                <div className={styles.card__thumb}>
                  <span className={styles.card__thumbLabel}>
                    {meta.label.toUpperCase()}
                  </span>
                </div>
                <Eyebrow tone="gold">{meta.label}</Eyebrow>
                <div className={styles.card__name}>{item.name}</div>
                {item.description ? (
                  <div className={styles.card__desc}>{item.description}</div>
                ) : null}
                <div className={styles.card__meta}>
                  {item.damage ? (
                    <span className={styles.card__metaItem}>
                      <span className={styles.card__metaLabel}>DMG</span>
                      <span className={styles.card__metaValue}>
                        {item.damage}
                      </span>
                    </span>
                  ) : null}
                  {item.effect ? (
                    <span className={styles.card__metaItem}>
                      <span className={styles.card__metaLabel}>EFX</span>
                      <span className={styles.card__metaValue}>
                        {item.effect}
                      </span>
                    </span>
                  ) : null}
                </div>
                <Spread align="center">
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                  <span className={styles.card__price}>
                    ¤ {formatPrice(item.price)}
                  </span>
                </Spread>
                <Spread align="center">
                  <Tag tone={item.isAvailable ? "success" : "danger"}>
                    {item.isAvailable ? "AVAILABLE" : "LOCKED"}
                  </Tag>
                </Spread>
              </Box>
            );
          })}
        </div>
      )}
    </>
  );
}
