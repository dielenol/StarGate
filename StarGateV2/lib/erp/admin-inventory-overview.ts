import { listInventoryOperationCharacters } from "@/lib/character-operation-targets";
import {
  listAvailableItems,
  listSharedInventory,
} from "@/lib/db/inventory";
import type { AdminInventoryOverviewResponse } from "@/types/erp-realtime";

export async function getAdminInventoryOverviewResponse(): Promise<AdminInventoryOverviewResponse> {
  const [characters, availableItems, sharedInventory] = await Promise.all([
    listInventoryOperationCharacters().catch(() => []),
    listAvailableItems().catch(() => []),
    listSharedInventory().catch(() => []),
  ]);

  return {
    characters: characters.map((character) => ({
      id: String(character._id),
      codename: character.codename,
      type: character.type,
      name: character.lore?.name ?? character.codename,
    })),
    availableItems: availableItems
      .filter((item) => item._id)
      .map((item) => ({
        id: String(item._id),
        name: item.name,
        category: item.category,
      })),
    sharedInventoryCount: sharedInventory.length,
  };
}
