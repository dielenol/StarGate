/**
 * inventory CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

import {
  findMasterItemById,
  findMasterItemBySlug,
  listMasterItemsByCategories,
  type ItemCategory,
  type MasterItem,
} from "@stargate/shared-db";

export {
  listMasterItems,
  listMasterItemsByCategories,
  listAvailableItems,
  findMasterItemById,
  findMasterItemBySlug,
  findMasterItemsBySlugs,
  findMasterItemsByIds,
  createMasterItem,
  updateMasterItem,
  deleteMasterItem,
  listCharacterInventory,
  addToInventory,
  removeFromInventory,
  deleteInventoryEntry,
  SHARED_INVENTORY_SCOPE,
  listSharedInventory,
  addToSharedInventory,
  removeFromSharedInventory,
} from "@stargate/shared-db";

export async function findMasterItemBySlugOrId(
  key: string,
): Promise<MasterItem | null> {
  return (await findMasterItemBySlug(key)) ?? findMasterItemById(key);
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
