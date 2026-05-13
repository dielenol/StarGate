import { redirect, notFound } from "next/navigation";

import type {
  CharacterInventory,
  ItemCategory,
  MasterItem,
} from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  findMasterItemsByIds,
  listAvailableItems,
  listCharacterInventory,
} from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryClient, {
  type InventoryClientEntry,
} from "./InventoryClient";
import InventoryGrantForm from "./InventoryGrantForm";
import styles from "./page.module.css";

interface CharacterInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

export default async function CharacterInventoryPage({
  params,
}: CharacterInventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGm = hasRole(role, "V");

  const { characterId } = await params;

  const character = await findCharacterById(characterId);
  if (!character) {
    notFound();
  }

  let inventory: CharacterInventory[] = [];
  let availableItems: MasterItem[] = [];
  let categoryByItemId = new Map<string, ItemCategory>();

  try {
    inventory = await listCharacterInventory(characterId);
  } catch {
    // DB 연결 실패 시 빈 배열 유지
  }

  if (inventory.length > 0) {
    try {
      const uniqueItemIds = Array.from(
        new Set(inventory.map((entry) => entry.itemId)),
      );
      const masters = await findMasterItemsByIds(uniqueItemIds);
      categoryByItemId = new Map(
        masters.map((m) => [String(m._id), m.category]),
      );
      // catalog drift 감지: inventory.itemId 가 master_items 에 없는 경우.
      const orphanIds = uniqueItemIds.filter(
        (id) => !categoryByItemId.has(id),
      );
      if (orphanIds.length > 0) {
        console.warn(
          `[inventory] catalog drift: ${orphanIds.length} itemId not found in master_items (characterId=${characterId})`,
        );
      }
    } catch {
      // master_items 조회 실패 시 categoryByItemId 빈 Map 유지 → 전부 "기타" 탭으로 노출
    }
  }

  if (isGm) {
    try {
      availableItems = await listAvailableItems();
    } catch {
      // 아이템 목록 조회 실패 시 빈 배열 유지
    }
  }

  const entries: InventoryClientEntry[] = inventory.map((entry) => ({
    _id: String(entry._id),
    itemId: entry.itemId,
    itemName: entry.itemName,
    quantity: entry.quantity,
    acquiredAt:
      entry.acquiredAt instanceof Date
        ? entry.acquiredAt.toISOString()
        : new Date(entry.acquiredAt).toISOString(),
    note: entry.note,
    category: categoryByItemId.get(entry.itemId) ?? null,
  }));

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "EQUIPMENT", href: "/erp/inventory" },
          { label: character.codename },
        ]}
        title={character.codename}
        right={
          <Button as="a" href="/erp/inventory">
            ← 도감
          </Button>
        }
      />

      {isGm ? (
        <Box className={styles.grantBox}>
          <PanelTitle>GRANT ITEM · GM</PanelTitle>
          <InventoryGrantForm
            characterId={characterId}
            availableItems={availableItems}
          />
        </Box>
      ) : null}

      <InventoryClient entries={entries} />
    </>
  );
}
