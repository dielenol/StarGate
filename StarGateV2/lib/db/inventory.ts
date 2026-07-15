/**
 * inventory CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

import {
  findMasterItemsBySlugsOrIds as findMasterItemsBySlugsOrIdsShared,
  findMasterItemById,
  findMasterItemBySlug,
  listCharacterInventory as listCharacterInventoryShared,
  listMasterItemsByCategories,
  masterItemsCol,
  type CharacterInventory,
  type ItemCategory,
  type MasterItem,
} from "@stargate/shared-db";
import { ObjectId, type Filter } from "mongodb";

import type {
  CharacterInventoryDto,
  InventoryEntryDto,
} from "@/types/inventory";

export {
  listMasterItems,
  listMasterItemsByCategories,
  listAvailableItems,
  findMasterItemById,
  findMasterItemBySlug,
  findMasterItemsBySlugs,
  findMasterItemsByIds,
  findMasterItemsBySlugsOrIds,
  createMasterItem,
  updateMasterItem,
  deleteMasterItem,
  listCharacterInventory,
  prepareCharacterInventoryItemLocks,
  lockCharacterInventoryItems,
  equipCharacterInventoryItem,
  consumeEquippedEquipmentCharge,
  addToInventory,
  removeFromInventory,
  deleteInventoryEntry,
  SHARED_INVENTORY_SCOPE,
  listSharedInventory,
  addToSharedInventory,
  removeFromSharedInventory,
} from "@stargate/shared-db";

function dateToIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function serializeCharacterInventory(
  inventory: CharacterInventory[],
): CharacterInventoryDto[] {
  return inventory.map((entry) => {
    const { _id, acquiredAt, equippedAt, ...rest } = entry;
    const equippedAtIso = dateToIso(equippedAt);
    return {
      ...rest,
      _id: _id ? String(_id) : undefined,
      acquiredAt: dateToIso(acquiredAt) ?? new Date(0).toISOString(),
      ...(equippedAtIso ? { equippedAt: equippedAtIso } : {}),
    };
  });
}

export function normalizedInventoryCategory(
  item: Pick<MasterItem, "slug" | "category">,
): ItemCategory {
  // live DB의 과거 드리프트를 migration 실행 전에도 안전하게 차단한다.
  if (item.slug === "military-fragment-grenade") return "CONSUMABLE";
  return item.category;
}

export async function listCharacterInventoryEntries(
  characterId: string,
): Promise<{
  inventory: CharacterInventory[];
  entries: InventoryEntryDto[];
}> {
  const inventory = await listCharacterInventoryShared(characterId);
  const masters = await findMasterItemsBySlugsOrIdsShared(
    inventory.map((entry) => entry.itemId),
  );
  const masterById = new Map(
    masters
      .filter((item) => item._id)
      .map((item) => [String(item._id), item]),
  );

  const entries = inventory.map((entry): InventoryEntryDto => {
    const master = masterById.get(entry.itemId);
    return {
      _id: String(entry._id),
      itemId: entry.itemId,
      itemName: master?.name ?? entry.itemName,
      quantity: entry.quantity,
      acquiredAt: dateToIso(entry.acquiredAt) ?? new Date(0).toISOString(),
      ...(entry.note ? { note: entry.note } : {}),
      category: master ? normalizedInventoryCategory(master) : null,
      ...(master?.slug ? { slug: master.slug } : {}),
      ...(master?.effect ? { effect: master.effect } : {}),
      ...(master?.damage ? { damage: master.damage } : {}),
      ...(master?.description ? { description: master.description } : {}),
      ...(master?.price !== undefined ? { price: master.price } : {}),
      ...(master?.previewImage ? { previewImage: master.previewImage } : {}),
      ...(master?.isPublic !== undefined ? { isPublic: master.isPublic } : {}),
      ...(master?.tags ? { tags: master.tags } : {}),
      ...(master?.equipmentAction
        ? { equipmentAction: master.equipmentAction }
        : {}),
      ...(entry.equipmentCharge
        ? { equipmentCharge: entry.equipmentCharge }
        : {}),
      ...(master?.workshop ? { workshop: master.workshop } : {}),
      ...(entry.equippedSlot ? { equippedSlot: entry.equippedSlot } : {}),
      ...(dateToIso(entry.equippedAt)
        ? { equippedAt: dateToIso(entry.equippedAt) }
        : {}),
    };
  });

  return { inventory, entries };
}

export async function findMasterItemBySlugOrId(
  key: string,
): Promise<MasterItem | null> {
  return (await findMasterItemBySlug(key)) ?? findMasterItemById(key);
}

function catalogVisibilityFilter(input: {
  userId: string;
  includePrivate: boolean;
}): Filter<MasterItem> {
  if (input.includePrivate) return {};
  return {
    $or: [
      { isPublic: { $ne: false } },
      { "workshop.ownerId": input.userId },
    ],
  };
}

export async function findVisibleMasterItemBySlugOrId(
  key: string,
  viewer: { userId: string; includePrivate: boolean },
): Promise<MasterItem | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const identifier: Filter<MasterItem> = ObjectId.isValid(trimmed)
    ? { $or: [{ slug: trimmed }, { _id: new ObjectId(trimmed) }] }
    : { slug: trimmed };
  const collection = await masterItemsCol();
  return collection.findOne({
    $and: [identifier, catalogVisibilityFilter(viewer)],
  });
}

export async function listVisibleMasterItems(
  viewer: { userId: string; includePrivate: boolean },
  options: {
    categories?: readonly ItemCategory[];
    availableOnly?: boolean;
  } = {},
): Promise<MasterItem[]> {
  if (options.categories?.length === 0) return [];
  const filters: Filter<MasterItem>[] = [catalogVisibilityFilter(viewer)];
  if (options.categories) {
    filters.push({ category: { $in: [...options.categories] } });
  }
  if (options.availableOnly) {
    filters.push({ isAvailable: { $ne: false } });
  }
  const collection = await masterItemsCol();
  return collection.find({ $and: filters }).sort({ category: 1, name: 1 }).toArray();
}

/**
 * 카테고리 + 공개/가용 플래그로 필터링한 마스터 아이템 목록.
 *
 * shared-db 측 category 인덱스 쿼리를 사용하며, 기존 호출처 호환을 위해 wrapper 이름은 유지한다.
 *
 * @param categories  허용 카테고리 (예: ["WEAPON", "ARMOR"])
 * @param opts.publicOnly  기본 true — isPublic === false 만 제외. undefined 는 통과 (legacy 호환).
 * @param opts.availableOnly  기본 true — isAvailable === false 만 제외.
 */
export async function listMasterItemsByCategoryFilter(
  categories: readonly ItemCategory[],
  opts: { publicOnly?: boolean; availableOnly?: boolean } = {},
): Promise<MasterItem[]> {
  return listMasterItemsByCategories(categories, opts);
}
