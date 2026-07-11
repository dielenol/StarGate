import { notFound, redirect } from "next/navigation";

import type {
  CharacterInventoryResponse,
  ItemCategory,
  SharedInventory,
} from "@/types/inventory";

import { canViewPersonalInventory } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { findCharacterById } from "@/lib/db/characters";
import {
  listCharacterInventoryEntries,
  listMasterItems,
  listSharedInventory,
  serializeCharacterInventory,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";

import PageHead from "@/components/ui/PageHead/PageHead";

import InventoryClient, { type InventoryClientEntry } from "./InventoryClient";
import styles from "./page.module.css";

interface CharacterInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

export default async function CharacterInventoryPage({
  params,
}: CharacterInventoryPageProps) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    notFound();
  }

  const character = await findCharacterById(characterId);
  if (!character) {
    notFound();
  }
  if (
    !canViewPersonalInventory(
      session.user.id,
      session.user.role,
      character,
    )
  ) {
    notFound();
  }

  let inventoryResponse: CharacterInventoryResponse = {
    inventory: [],
    entries: [],
    equipped: {},
  };
  let sharedInventory: SharedInventory[] = [];
  let masterByItemId = new Map<
    string,
    { category: ItemCategory; slug?: string; effect?: string }
  >();

  const [personalResult, sharedResult] = await Promise.all([
    listCharacterInventoryEntries(characterId).catch(() => ({
      inventory: [],
      entries: [],
    })),
    listSharedInventory().catch(() => []),
  ]);
  sharedInventory = sharedResult;
  inventoryResponse = {
    inventory: serializeCharacterInventory(personalResult.inventory),
    entries: personalResult.entries,
    equipped: Object.fromEntries(
      personalResult.entries
        .filter((entry) => entry.equippedSlot)
        .map((entry) => [entry.equippedSlot, entry]),
    ),
  };

  const uniqueItemIds = Array.from(
    new Set(
      sharedInventory
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
    entry: SharedInventory,
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
          entries={inventoryResponse.entries}
          characterId={characterId}
          initialResponse={inventoryResponse}
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
