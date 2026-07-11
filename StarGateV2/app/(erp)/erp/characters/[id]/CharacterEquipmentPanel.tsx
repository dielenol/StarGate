"use client";

import Image from "next/image";
import { useState } from "react";

import type {
  CharacterInventoryResponse,
  EquipmentSlot,
  InventoryEntryDto,
} from "@/types/inventory";

import { useEquipInventoryItem } from "@/hooks/mutations/useInventoryMutation";
import { useCharacterInventory } from "@/hooks/queries/useInventoryQuery";

import {
  IconInventoryEquipment,
  IconSwordShield,
} from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import styles from "./page.module.css";

interface Props {
  characterId: string;
  initialInventory: CharacterInventoryResponse;
  canManage: boolean;
}

const SLOT_LABEL: Record<EquipmentSlot, string> = {
  WEAPON: "활성 무기",
  ARMOR: "활성 방어구",
};

function itemDescription(item: InventoryEntryDto): string {
  return item.damage || item.effect || item.description || "상세 정보 미등록";
}

function itemImageSrc(item: InventoryEntryDto): string | null {
  const src = item.previewImage?.trim();
  return src?.startsWith("/assets/") ? src : null;
}

export default function CharacterEquipmentPanel({
  characterId,
  initialInventory,
  canManage,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const inventoryQuery = useCharacterInventory(characterId, {
    initialData: initialInventory,
    enabled: canManage,
  });
  const equipMutation = useEquipInventoryItem(characterId);
  const entries = inventoryQuery.data?.entries ?? initialInventory.entries;
  const equippable = entries.filter(
    (entry) => entry.category === "WEAPON" || entry.category === "ARMOR",
  );

  function handleEquip(item: InventoryEntryDto) {
    const current = entries.find(
      (entry) => entry.equippedSlot === item.category,
    );
    if (current?.itemId === item.itemId) return;
    const confirmed = current
      ? window.confirm(
          `${current.itemName}에서 ${item.itemName}(으)로 교체하시겠습니까?`,
        )
      : window.confirm(`${item.itemName}을(를) 장착하시겠습니까?`);
    if (!confirmed) return;

    setError(null);
    equipMutation.mutate(
      { itemId: item.itemId },
      { onError: (mutationError) => setError(mutationError.message) },
    );
  }

  return (
    <Box>
      <PanelTitle
        right={<span className={styles.mono}>INVENTORY LINKED</span>}
      >
        <span className={styles.panelTitleLabel}>
          <IconSwordShield
            width={16}
            height={16}
            className={styles.panelTitleLabel__icon}
          />
          EQUIPMENT LOADOUT
        </span>
      </PanelTitle>

      <div className={styles.loadoutGrid}>
        {(["WEAPON", "ARMOR"] as const).map((slot) => {
          const item = entries.find((entry) => entry.equippedSlot === slot);
          const imageSrc = item ? itemImageSrc(item) : null;
          return (
            <div key={slot} className={styles.loadoutSlot}>
              <div className={styles.loadoutSlot__head}>
                <IconInventoryEquipment width={18} height={18} aria-hidden />
                <span>{SLOT_LABEL[slot]}</span>
                <Tag tone={item ? "gold" : "default"}>
                  {item ? "EQUIPPED" : "EMPTY"}
                </Tag>
              </div>
              {item ? (
                <div className={styles.loadoutSlot__content}>
                  {imageSrc ? (
                    <Image
                      src={imageSrc}
                      width={72}
                      height={72}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className={styles.loadoutSlot__image}
                      unoptimized
                    />
                  ) : (
                    <span className={styles.loadoutSlot__imageFallback} aria-hidden>
                      <IconInventoryEquipment width={32} height={32} />
                    </span>
                  )}
                  <div>
                    <strong>{item.itemName}</strong>
                    <p>{itemDescription(item)}</p>
                  </div>
                </div>
              ) : (
                <p>장착된 {slot === "WEAPON" ? "무기" : "방어구"}가 없습니다.</p>
              )}
            </div>
          );
        })}
      </div>

      {canManage && equippable.length > 0 ? (
        <div className={styles.loadoutPicker}>
          <div className={styles.loadoutPicker__title}>보유 장비에서 교체</div>
          <div className={styles.loadoutPicker__items}>
            {equippable.map((item) => {
              const isEquipped = item.equippedSlot === item.category;
              const imageSrc = itemImageSrc(item);
              const isPending =
                equipMutation.isPending &&
                equipMutation.variables?.itemId === item.itemId;
              return (
                <button
                  key={item.itemId}
                  type="button"
                  className={styles.loadoutPicker__button}
                  disabled={isEquipped || equipMutation.isPending}
                  aria-busy={isPending}
                  onClick={() => handleEquip(item)}
                >
                  <span className={styles.loadoutPicker__itemLabel}>
                    {imageSrc ? (
                      <Image
                        src={imageSrc}
                        width={36}
                        height={36}
                        alt=""
                        aria-hidden
                        draggable={false}
                        className={styles.loadoutPicker__image}
                        unoptimized
                      />
                    ) : null}
                    <span>{item.itemName}</span>
                  </span>
                  <b>{isEquipped ? "장착 중" : isPending ? "교체 중" : "교체"}</b>
                </button>
              );
            })}
          </div>
        </div>
      ) : canManage ? (
        <div className={styles.loadoutEmpty}>
          인벤토리에 장착 가능한 무기 또는 방어구가 없습니다.
        </div>
      ) : null}

      {inventoryQuery.isError || error ? (
        <div className={styles.loadoutError} role="alert">
          {error ?? inventoryQuery.error?.message}
        </div>
      ) : null}
    </Box>
  );
}
