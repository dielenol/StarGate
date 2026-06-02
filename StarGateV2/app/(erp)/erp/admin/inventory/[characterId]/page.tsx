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
} from "../../../inventory/[characterId]/InventoryClient";
import InventoryGrantForm, {
  type InventoryGrantItem,
} from "../../../inventory/[characterId]/InventoryGrantForm";
import styles from "../../../inventory/[characterId]/page.module.css";

interface AdminInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

function toInventoryGrantItems(items: MasterItem[]): InventoryGrantItem[] {
  return items
    .filter((item) => item._id)
    .map((item) => ({
      id: String(item._id),
      name: item.name,
      category: item.category,
    }));
}

/**
 * GM 전용 인벤토리 관리 (지급 + 조회). 일반 `/erp/inventory/[characterId]` 의 GM 분기가
 * 본 라우트로 분리됨 — 일반 인벤은 사용자/캐릭 view 전용, admin 라우트만 GrantForm 노출.
 *
 * 권한: V 이상 (GM/Voidwalker). 미만 시 일반 인벤으로 redirect.
 */
export default async function AdminCharacterInventoryPage({
  params,
}: AdminInventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  if (!hasRole(role, "V")) {
    // 일반 사용자가 admin URL 직접 진입 시 캐릭별 일반 인벤으로 강등.
    const { characterId } = await params;
    redirect(`/erp/inventory/${characterId}`);
  }

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
    /* DB 실패 시 빈 배열 */
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
    } catch {
      /* master 조회 실패 → 빈 Map */
    }
  }

  try {
    availableItems = await listAvailableItems();
  } catch {
    /* 아이템 목록 실패 → 빈 배열 */
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
  const grantItems = toInventoryGrantItems(availableItems);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin/inventory" },
          { label: "INVENTORY", href: "/erp/admin/inventory" },
          { label: character.codename },
        ]}
        title={`${character.codename} · 관리자 모드`}
        right={
          <>
            <Button as="a" href={`/erp/inventory/${characterId}`}>
              ← 일반 모드
            </Button>
            <Button as="a" href="/erp/admin/inventory">
              ← 허브
            </Button>
          </>
        }
      />

      <Box className={styles.grantBox}>
        <PanelTitle>GRANT ITEM · GM</PanelTitle>
        <InventoryGrantForm
          characterId={characterId}
          availableItems={grantItems}
        />
      </Box>

      <InventoryClient entries={entries} />
    </>
  );
}
