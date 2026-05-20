import { redirect, notFound } from "next/navigation";

import type {
  CharacterInventory,
  ItemCategory,
} from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  listMasterItems,
  listCharacterInventory,
} from "@/lib/db/inventory";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import InventoryClient, {
  type InventoryClientEntry,
} from "./InventoryClient";

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
  let masterByItemId = new Map<
    string,
    { category: ItemCategory; slug?: string; effect?: string }
  >();

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
      const itemIdSet = new Set(uniqueItemIds);
      const masters = (await listMasterItems()).filter(
        (m) => m._id && itemIdSet.has(String(m._id)),
      );
      masterByItemId = new Map(
        masters.map((m) => [
          String(m._id),
          { category: m.category, slug: m.slug, effect: m.effect },
        ]),
      );
      // catalog drift 감지: inventory.itemId 가 master_items 에 없는 경우.
      const orphanIds = uniqueItemIds.filter(
        (id) => !masterByItemId.has(id),
      );
      if (orphanIds.length > 0) {
        console.warn(
          `[inventory] catalog drift: ${orphanIds.length} itemId not found in master_items (characterId=${characterId})`,
        );
      }
    } catch {
      // master_items 조회 실패 시 masterByItemId 빈 Map 유지 → 전부 "기타" 탭으로 노출
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
    category: masterByItemId.get(entry.itemId)?.category ?? null,
    slug: masterByItemId.get(entry.itemId)?.slug,
    effect: masterByItemId.get(entry.itemId)?.effect,
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
          <>
            {isGm ? (
              <Button
                as="a"
                href={`/erp/admin/inventory/${characterId}`}
                variant="primary"
              >
                관리자 모드 →
              </Button>
            ) : null}
            <Button as="a" href="/erp/inventory">
              ← 도감
            </Button>
          </>
        }
      />

      <InventoryClient entries={entries} />
    </>
  );
}
