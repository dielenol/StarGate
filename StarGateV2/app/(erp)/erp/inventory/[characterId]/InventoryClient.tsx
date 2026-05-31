"use client";

import { useMemo, useState } from "react";

import type { ItemCategory } from "@/types/inventory";

import {
  IconConsumable,
  IconEquipment,
  IconInventory,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import ShopItemIcon from "../../shop/ShopItemIcon";

import styles from "./page.module.css";

/* ── 타입 ── */

export interface InventoryClientEntry {
  _id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: string;
  note?: string;
  category: ItemCategory | null;
  slug?: string;
  effect?: string;
}

interface InventoryClientProps {
  entries: InventoryClientEntry[];
}

type InventoryTab = "ALL" | "EQUIPMENT" | "CONSUMABLE" | "OTHER";

/* ── 상수 ── */

const TAB_DEFS: { value: InventoryTab; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "EQUIPMENT", label: "장비" },
  { value: "CONSUMABLE", label: "소모품" },
  { value: "OTHER", label: "기타" },
];

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "샘플",
  SPECIAL: "특수",
};

const UNKNOWN_CATEGORY_LABEL = "분류없음";

/* ── 유틸 ── */

function matchesTab(
  category: ItemCategory | null,
  tab: InventoryTab,
): boolean {
  if (tab === "ALL") return true;
  if (tab === "EQUIPMENT") return category === "WEAPON" || category === "ARMOR";
  if (tab === "CONSUMABLE") return category === "CONSUMABLE";
  if (tab === "OTHER") {
    return (
      category === "MATERIAL" || category === "SPECIAL" || category === null
    );
  }
  return false;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function categoryLabel(category: ItemCategory | null): string {
  return category === null ? UNKNOWN_CATEGORY_LABEL : CATEGORY_LABEL[category];
}

function categoryTone(category: ItemCategory | null): string {
  if (category === "WEAPON" || category === "ARMOR") return "equipment";
  if (category === "CONSUMABLE") return "consumable";
  return "other";
}

function tabTone(tab: InventoryTab): string {
  if (tab === "EQUIPMENT") return "equipment";
  if (tab === "CONSUMABLE") return "consumable";
  if (tab === "OTHER") return "other";
  return "all";
}

function CategoryIcon({
  category,
  slug,
}: {
  category: ItemCategory | null;
  slug?: string;
}) {
  if (category === "CONSUMABLE" && slug) {
    return <ShopItemIcon slug={slug} size={40} />;
  }
  if (category === "CONSUMABLE") {
    return <IconConsumable className={styles.slot__iconSvg} aria-hidden />;
  }
  if (category === "WEAPON" || category === "ARMOR") {
    return <IconEquipment className={styles.slot__iconSvg} aria-hidden />;
  }
  return <IconInventory className={styles.slot__iconSvg} aria-hidden />;
}

/* ── 컴포넌트 ── */

export default function InventoryClient({ entries }: InventoryClientProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>("ALL");

  const countByTab = useMemo(() => {
    const counts: Record<InventoryTab, number> = {
      ALL: 0,
      EQUIPMENT: 0,
      CONSUMABLE: 0,
      OTHER: 0,
    };
    for (const entry of entries) {
      counts.ALL += 1;
      if (entry.category === "WEAPON" || entry.category === "ARMOR") {
        counts.EQUIPMENT += 1;
      } else if (entry.category === "CONSUMABLE") {
        counts.CONSUMABLE += 1;
      } else {
        counts.OTHER += 1;
      }
    }
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesTab(entry.category, activeTab)),
    [entries, activeTab],
  );

  return (
    <Box>
      <PanelTitle
        right={<span className={styles.mono}>{entries.length} 개</span>}
      >
        INVENTORY
      </PanelTitle>

      {/* 탭은 항상 렌더 — 보유 0개여도 카테고리 구조를 노출해 일관된 UX 유지. */}
      <div
        role="tablist"
        aria-label="인벤토리 카테고리"
        className={styles.tabs}
      >
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = countByTab[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={[
                styles.tabs__tab,
                styles[`tabs__tab--${tabTone(tab.value)}`],
                isActive ? styles["tabs__tab--active"] : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}{" "}
              <span className={styles.tabs__count}>· {count}</span>
            </button>
          );
        })}
      </div>

      {filteredEntries.length === 0 ? (
        <div className={styles.empty}>
          {entries.length === 0
            ? "보유 아이템이 없습니다."
            : "이 카테고리에 보유 아이템이 없습니다."}
        </div>
      ) : (
        <div
          className={[
            styles.slotGrid,
            styles[`slotGrid--${tabTone(activeTab)}`],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {filteredEntries.map((entry) => {
            const tone = categoryTone(entry.category);
            const isConsumable = entry.category === "CONSUMABLE";
            return (
              <article
                key={entry._id}
                className={[styles.slot, styles[`slot--${tone}`]]
                  .filter(Boolean)
                .join(" ")}
              >
                <div className={styles.slot__art} aria-hidden>
                  <CategoryIcon category={entry.category} slug={entry.slug} />
                </div>
                <div className={styles.slot__body}>
                  <div className={styles.slot__name}>{entry.itemName}</div>
                  {isConsumable && entry.effect ? (
                    <div className={styles.slot__effect}>{entry.effect}</div>
                  ) : null}
                  {!isConsumable ? (
                    <div className={styles.slot__meta}>
                      <span>{categoryLabel(entry.category)}</span>
                      <span className={styles.mono}>
                        {formatDate(entry.acquiredAt)}
                      </span>
                    </div>
                  ) : null}
                  {!isConsumable && entry.note ? (
                    <div className={styles.slot__note}>{entry.note}</div>
                  ) : null}
                </div>
                <div className={styles.slot__qty}>× {entry.quantity}</div>
              </article>
            );
          })}
        </div>
      )}
    </Box>
  );
}
