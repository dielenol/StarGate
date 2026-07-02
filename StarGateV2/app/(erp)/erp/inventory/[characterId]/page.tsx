import { notFound, redirect } from "next/navigation";

import type {
  CharacterInventory,
  ItemCategory,
  SharedInventory,
} from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { findCharacterById } from "@/lib/db/characters";
import {
  listCharacterInventory,
  listMasterItems,
  listSharedInventory,
} from "@/lib/db/inventory";

import PageHead from "@/components/ui/PageHead/PageHead";

import InventoryClient, { type InventoryClientEntry } from "./InventoryClient";
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

  const { characterId } = await params;

  const character = await findCharacterById(characterId);
  if (!character) {
    notFound();
  }

  let inventory: CharacterInventory[] = [];
  let sharedInventory: SharedInventory[] = [];
  let masterByItemId = new Map<
    string,
    { category: ItemCategory; slug?: string; effect?: string }
  >();

  [inventory, sharedInventory] = await Promise.all([
    listCharacterInventory(characterId).catch(() => []),
    listSharedInventory().catch(() => []),
  ]);

  const uniqueItemIds = Array.from(
    new Set(
      [...inventory, ...sharedInventory]
        .map((entry) => entry.itemId)
        .filter(Boolean),
    ),
  );

  if (uniqueItemIds.length > 0) {
    try {
      const itemIdSet = new Set(uniqueItemIds);
      const masters = (await listMasterItems()).filter(
        (item) => item._id && itemIdSet.has(String(item._id)),
      );
      masterByItemId = new Map(
        masters.map((item) => [
          String(item._id),
          { category: item.category, slug: item.slug, effect: item.effect },
        ]),
      );
    } catch {
      // Missing master metadata falls back to the "other" category display.
    }
  }

  const toClientEntry = (
    entry: CharacterInventory | SharedInventory,
  ): InventoryClientEntry => ({
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
  });

  const entries = inventory.map(toClientEntry);
  const sharedEntries = sharedInventory.map(toClientEntry);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "INVENTORY", href: "/erp/inventory" },
          { label: character.codename },
        ]}
        title={character.codename}
      />

      <div className={styles.inventoryStack} data-pixel-font="ui">
        <InventoryClient
          entries={entries}
          title="개인 인벤토리"
          variant="personal"
        />
        <InventoryClient
          entries={sharedEntries}
          title="공용 인벤토리"
          variant="shared"
          emptyText="공용 인벤토리에 등록된 아이템이 없습니다."
          filteredEmptyText="이 카테고리에 등록된 공용 아이템이 없습니다."
        />
      </div>
    </>
  );
}
