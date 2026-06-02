import { redirect } from "next/navigation";

import type {
  ItemCategory,
  MasterItem,
  SharedInventory,
} from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listAvailableItems,
  listMasterItems,
  listSharedInventory,
} from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryModeNav from "../_components/InventoryModeNav";
import InventoryClient, {
  type InventoryClientEntry,
} from "../[characterId]/InventoryClient";
import InventoryGrantForm from "../[characterId]/InventoryGrantForm";
import styles from "../[characterId]/page.module.css";

export default async function SharedInventoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGm = hasRole(session.user.role, "V");

  let inventory: SharedInventory[] = [];
  let availableItems: MasterItem[] = [];
  let masterByItemId = new Map<
    string,
    { category: ItemCategory; slug?: string; effect?: string }
  >();

  try {
    inventory = await listSharedInventory();
  } catch {
    // Keep the page visible even if the shared collection is temporarily absent.
  }

  if (inventory.length > 0) {
    try {
      const uniqueItemIds = Array.from(
        new Set(inventory.map((entry) => entry.itemId)),
      );
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

  if (isGm) {
    try {
      availableItems = await listAvailableItems();
    } catch {
      // The form will render with an empty item list.
    }
  }

  const entries: InventoryClientEntry[] = inventory.map((entry) => ({
    _id: entry._id ? String(entry._id) : `${entry.scope}:${entry.itemId}`,
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
          { label: "INVENTORY", href: "/erp/inventory" },
          { label: "SHARED" },
        ]}
        title="공용 인벤토리"
        right={
          <>
            <Button as="a" href="/erp/inventory">
              인벤토리 허브
            </Button>
            <Button as="a" href="/erp/shop">
              편의점
            </Button>
          </>
        }
      />

      <InventoryModeNav active="shared" />

      {isGm ? (
        <Box className={styles.grantBox}>
          <PanelTitle>GRANT SHARED ITEM · GM</PanelTitle>
          <InventoryGrantForm
            mode="shared"
            availableItems={availableItems}
          />
        </Box>
      ) : null}

      <InventoryClient
        entries={entries}
        title="SHARED INVENTORY"
        emptyText="공용 인벤토리에 등록된 아이템이 없습니다."
        filteredEmptyText="이 카테고리에 등록된 공용 아이템이 없습니다."
      />
    </>
  );
}
