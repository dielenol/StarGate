"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type {
  CharacterInventoryResponse,
  InventoryEntryDto,
  ItemCategory,
} from "@/types/inventory";

import {
  useEquipInventoryItem,
  useRemoveInventory,
} from "@/hooks/mutations/useInventoryMutation";
import { useCharacterInventory } from "@/hooks/queries/useInventoryQuery";

import {
  IconArchive,
  IconConsumable,
  IconGridAll,
  IconInventory,
  IconInventoryEquipment,
  IconMisc,
  IconSearch,
  IconSharedInventory,
  IconTimeline,
  type IconComponent,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import Input from "@/components/ui/Input/Input";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import { formatDate } from "@/lib/format/date";
import { getConsumableItemImageSrc } from "@/lib/shop/item-images";

import styles from "./page.module.css";

export type InventoryClientEntry = InventoryEntryDto;

interface InventoryClientProps {
  entries: InventoryClientEntry[];
  characterId?: string;
  initialResponse?: CharacterInventoryResponse;
  title?: string;
  variant?: "personal" | "shared";
  emptyText?: string;
  filteredEmptyText?: string;
  canRemove?: boolean;
}

type InventoryTab = "ALL" | "EQUIPMENT" | "CONSUMABLE" | "OTHER";
type InventoryView = "GRID" | "DENSE";

const TAB_DEFS: { value: InventoryTab; label: string; icon: IconComponent }[] =
  [
    { value: "ALL", label: "전체", icon: IconInventory },
    { value: "EQUIPMENT", label: "장비", icon: IconInventoryEquipment },
    { value: "CONSUMABLE", label: "소모품", icon: IconConsumable },
    { value: "OTHER", label: "기타", icon: IconMisc },
  ];

const SECTION_ICONS: Record<"personal" | "shared", IconComponent> = {
  personal: IconInventory,
  shared: IconSharedInventory,
};

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "샘플",
  SPECIAL: "특수",
};

const UNKNOWN_CATEGORY_LABEL = "분류 없음";
const MAX_REMOVE_QUANTITY = 999;

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

function formatQuantity(value: number): string {
  return value.toLocaleString();
}

function matchesQuery(entry: InventoryClientEntry, query: string): boolean {
  if (!query) return true;

  const searchable = [
    entry.itemName,
    categoryLabel(entry.category),
    entry.effect,
    entry.note,
    entry.slug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

function CategoryIcon({
  category,
  slug,
  previewImage,
}: {
  category: ItemCategory | null;
  slug?: string;
  previewImage?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const canonicalImage =
    category === "CONSUMABLE" && slug
      ? getConsumableItemImageSrc(slug)
      : undefined;
  const previewImageSrc = previewImage?.trim();
  const imageSrc =
    canonicalImage ??
    (previewImageSrc?.startsWith("/assets/") ? previewImageSrc : undefined);

  if (imageSrc && !imageFailed) {
    return (
      <Image
        src={imageSrc}
        width={54}
        height={54}
        alt=""
        aria-hidden
        draggable={false}
        className={styles.slot__image}
        unoptimized
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (category === "CONSUMABLE") {
    return (
      <IconConsumable
        className={styles.slot__iconSvg}
        aria-hidden
      />
    );
  }
  if (category === "WEAPON" || category === "ARMOR") {
    return (
      <IconInventoryEquipment
        className={styles.slot__iconSvg}
        aria-hidden
      />
    );
  }
  return <IconMisc className={styles.slot__iconSvg} aria-hidden />;
}

export default function InventoryClient({
  entries: initialEntries,
  characterId,
  initialResponse,
  title = "INVENTORY",
  variant = "personal",
  emptyText = "보유 아이템이 없습니다.",
  filteredEmptyText = "이 카테고리에 보유 아이템이 없습니다.",
  canRemove = false,
}: InventoryClientProps) {
  const [activeTab, setActiveTab] = useState<InventoryTab>("ALL");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<InventoryView>("GRID");
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inventoryQuery = useCharacterInventory(characterId ?? "", {
    initialData: initialResponse,
    enabled: variant === "personal" && Boolean(characterId),
  });
  const equipMutation = useEquipInventoryItem(characterId ?? "");
  const removeMutation = useRemoveInventory(characterId ?? "");
  const entries = inventoryQuery.data?.entries ?? initialEntries;
  const SectionIcon = SECTION_ICONS[variant];

  function handleEquip(entry: InventoryClientEntry) {
    if (!characterId || !entry.category) return;
    const current = entries.find(
      (candidate) => candidate.equippedSlot === entry.category,
    );
    if (current?.itemId === entry.itemId) return;

    const confirmed = current
      ? window.confirm(
          `${current.itemName}에서 ${entry.itemName}(으)로 교체하시겠습니까?`,
        )
      : window.confirm(`${entry.itemName}을(를) 장착하시겠습니까?`);
    if (!confirmed) return;

    setEquipmentError(null);
    equipMutation.mutate(
      { itemId: entry.itemId },
      {
        onError: (error) => setEquipmentError(error.message),
      },
    );
  }

  function handleRemove(entry: InventoryClientEntry) {
    if (!characterId || !canRemove) return;
    if (entry.equippedSlot) {
      setRemoveError("장착 중인 아이템은 제거할 수 없습니다.");
      return;
    }

    const rawQuantity = window.prompt(
      `${entry.itemName}에서 제거할 수량을 입력하세요. (보유 ${formatQuantity(entry.quantity)}개)`,
      String(Math.min(entry.quantity, MAX_REMOVE_QUANTITY)),
    );
    if (rawQuantity === null) return;

    const quantity = Number(rawQuantity);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > entry.quantity ||
      quantity > MAX_REMOVE_QUANTITY
    ) {
      setRemoveError(
        `제거 수량은 1~${formatQuantity(Math.min(entry.quantity, MAX_REMOVE_QUANTITY))} 사이의 정수여야 합니다.`,
      );
      return;
    }

    if (
      !window.confirm(
        `${entry.itemName} ${formatQuantity(quantity)}개를 제거하시겠습니까?`,
      )
    ) {
      return;
    }

    setRemoveError(null);
    removeMutation.mutate(
      { itemId: entry.itemId, quantity },
      { onError: (error) => setRemoveError(error.message) },
    );
  }

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

  const summary = useMemo(() => {
    let quantity = 0;
    let equipment = 0;
    let consumables = 0;
    let latest: InventoryClientEntry | null = null;

    for (const entry of entries) {
      quantity += entry.quantity;
      if (entry.category === "WEAPON" || entry.category === "ARMOR") {
        equipment += 1;
      } else if (entry.category === "CONSUMABLE") {
        consumables += entry.quantity;
      }

      const entryTime = new Date(entry.acquiredAt).getTime();
      const latestTime = latest
        ? new Date(latest.acquiredAt).getTime()
        : -Infinity;
      if (!Number.isNaN(entryTime) && entryTime > latestTime) {
        latest = entry;
      }
    }

    return { quantity, equipment, consumables, latest };
  }, [entries]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          matchesTab(entry.category, activeTab) &&
          matchesQuery(entry, normalizedQuery),
      ),
    [entries, activeTab, normalizedQuery],
  );

  const filteredQuantity = useMemo(
    () => filteredEntries.reduce((total, entry) => total + entry.quantity, 0),
    [filteredEntries],
  );

  const activeTabLabel =
    TAB_DEFS.find((tab) => tab.value === activeTab)?.label ?? "전체";
  const hasQuery = normalizedQuery.length > 0;

  return (
    <Box className={styles.inventoryPanel}>
      <PanelTitle
        right={
          <span className={styles.mono}>
            {filteredEntries.length}/{entries.length} 슬롯 ·{" "}
            {formatQuantity(filteredQuantity)}개
          </span>
        }
      >
        <span className={styles.sectionTitle}>
          <SectionIcon className={styles.sectionTitle__icon} aria-hidden />
          <span>{title}</span>
        </span>
      </PanelTitle>

      <div
        className={styles.summaryGrid}
        role="group"
        aria-label={`${title} 요약`}
      >
        <div className={styles.summaryCard}>
          <IconArchive className={styles.summaryCard__icon} aria-hidden />
          <span className={styles.summaryCard__label}>보유 수량</span>
          <strong>{formatQuantity(summary.quantity)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <IconInventoryEquipment
            className={styles.summaryCard__icon}
            aria-hidden
          />
          <span className={styles.summaryCard__label}>장비 슬롯</span>
          <strong>{formatQuantity(summary.equipment)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <IconConsumable
            className={styles.summaryCard__icon}
            aria-hidden
          />
          <span className={styles.summaryCard__label}>소모품 수량</span>
          <strong>{formatQuantity(summary.consumables)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <IconTimeline className={styles.summaryCard__icon} aria-hidden />
          <span className={styles.summaryCard__label}>최근 입수</span>
          <strong title={summary.latest?.itemName}>
            {summary.latest ? summary.latest.itemName : "기록 없음"}
          </strong>
        </div>
      </div>

      {inventoryQuery.isError ? (
        <div className={styles.equipmentNotice} role="alert">
          {inventoryQuery.error.message}
        </div>
      ) : null}
      {equipmentError ? (
        <div className={styles.equipmentNotice} role="alert">
          {equipmentError}
        </div>
      ) : null}
      {removeError ? (
        <div className={styles.equipmentNotice} role="alert">
          {removeError}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <Eyebrow>검색</Eyebrow>
          <span className={styles.searchField__control}>
            <IconSearch className={styles.searchField__icon} aria-hidden />
            <Input
              className={styles.searchField__input}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="아이템, 효과, 메모"
            />
          </span>
        </label>

        <div className={styles.toolbar__meta}>
          <span>{activeTabLabel}</span>
          <strong>{formatQuantity(filteredQuantity)}개</strong>
        </div>

        <div className={styles.viewToggle} role="group" aria-label="보기 방식">
          <button
            type="button"
            aria-pressed={view === "GRID"}
            className={[
              styles.viewToggle__button,
              view === "GRID" ? styles["viewToggle__button--active"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setView("GRID")}
          >
            <IconGridAll className={styles.viewToggle__icon} aria-hidden />
            카드
          </button>
          <button
            type="button"
            aria-pressed={view === "DENSE"}
            className={[
              styles.viewToggle__button,
              view === "DENSE" ? styles["viewToggle__button--active"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setView("DENSE")}
          >
            <IconInventory className={styles.viewToggle__icon} aria-hidden />
            간략
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="인벤토리 카테고리"
        className={styles.tabs}
      >
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count = countByTab[tab.value];
          const TabIcon = tab.icon;
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
              <TabIcon className={styles.tabs__icon} aria-hidden />
              <span>{tab.label}</span>
              <span className={styles.tabs__count}>{count}</span>
            </button>
          );
        })}
      </div>

      {filteredEntries.length === 0 ? (
        <div className={styles.empty}>
          <strong>
            {entries.length === 0
              ? emptyText
              : hasQuery
                ? "검색 결과가 없습니다."
                : filteredEmptyText}
          </strong>
          <span>
            {entries.length === 0
              ? "아이템이 지급되면 이 영역에 보관 기록이 표시됩니다."
              : "검색어 또는 카테고리 필터를 조정해보세요."}
          </span>
        </div>
      ) : (
        <div
          className={[
            styles.slotGrid,
            styles[`slotGrid--${tabTone(activeTab)}`],
            view === "DENSE" ? styles["slotGrid--dense"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {filteredEntries.map((entry) => {
            const tone = categoryTone(entry.category);
            const isConsumable = entry.category === "CONSUMABLE";
            const isEquippable =
              variant === "personal" &&
              Boolean(characterId) &&
              (entry.category === "WEAPON" || entry.category === "ARMOR");
            const isEquipped = entry.equippedSlot === entry.category;
            const slotHasOtherItem = entries.some(
              (candidate) =>
                candidate.equippedSlot === entry.category &&
                candidate.itemId !== entry.itemId,
            );
            const isPending =
              equipMutation.isPending &&
              equipMutation.variables?.itemId === entry.itemId;
            return (
              <article
                key={entry._id}
                className={[styles.slot, styles[`slot--${tone}`]]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className={styles.slot__art} aria-hidden>
                  <CategoryIcon
                    key={`${entry.itemId}:${entry.category ?? ""}:${entry.slug ?? ""}:${entry.previewImage ?? ""}`}
                    category={entry.category}
                    slug={entry.slug}
                    previewImage={entry.previewImage}
                  />
                </div>
                <div className={styles.slot__body}>
                  <div className={styles.slot__topline}>
                    <div className={styles.slot__name}>{entry.itemName}</div>
                    <div className={styles.slot__qty}>
                      x {formatQuantity(entry.quantity)}
                    </div>
                  </div>
                  <div className={styles.slot__meta}>
                    <span
                      className={[
                        styles.categoryPill,
                        styles[`categoryPill--${tone}`],
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {categoryLabel(entry.category)}
                    </span>
                    <span className={styles.mono}>
                      {formatDate(entry.acquiredAt, "numeric")}
                    </span>
                  </div>
                  {entry.effect ? (
                    <div className={styles.slot__effect}>{entry.effect}</div>
                  ) : null}
                  {entry.note ? (
                    <div className={styles.slot__note}>{entry.note}</div>
                  ) : null}
                  {isConsumable && !entry.effect && !entry.note ? (
                    <div className={styles.slot__note}>효과 정보 미등록</div>
                  ) : null}
                  {isEquippable || canRemove ? (
                    <div className={styles.slot__actions}>
                      {isEquippable ? (
                        isEquipped ? (
                          <span className={styles.equippedBadge}>장착 중</span>
                        ) : (
                          <button
                            type="button"
                            className={styles.equipButton}
                            disabled={equipMutation.isPending}
                            aria-busy={isPending}
                            onClick={() => handleEquip(entry)}
                          >
                            {isPending
                              ? "교체 중"
                              : slotHasOtherItem
                                ? "교체"
                                : "장착"}
                          </button>
                        )
                      ) : null}
                      {canRemove ? (
                        <button
                          type="button"
                          className={styles.removeButton}
                          disabled={
                            removeMutation.isPending || Boolean(entry.equippedSlot)
                          }
                          aria-busy={
                            removeMutation.isPending &&
                            removeMutation.variables?.itemId === entry.itemId
                          }
                          title={
                            entry.equippedSlot
                              ? "장착 중인 아이템은 제거할 수 없습니다."
                              : undefined
                          }
                          onClick={() => handleRemove(entry)}
                        >
                          {removeMutation.isPending &&
                          removeMutation.variables?.itemId === entry.itemId
                            ? "제거 중"
                            : "제거"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Box>
  );
}
