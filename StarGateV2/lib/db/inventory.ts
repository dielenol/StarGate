/**
 * inventory CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

import {
  listMasterItems,
  type ItemCategory,
  type MasterItem,
} from "@stargate/shared-db";

export {
  listMasterItems,
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
} from "@stargate/shared-db";

/**
 * 카테고리 + 공개/가용 플래그로 필터링한 마스터 아이템 목록.
 *
 * shared-db CRUD 시그니처 확장 대신 임시 wrapper. 대용량(N>500) 단계에서는
 * shared-db 측에 인덱스 활용 쿼리(listMasterItemsByCategory)를 추가하고 이 wrapper 폐기 예정.
 *
 * @param categories  허용 카테고리 (예: ["WEAPON", "ARMOR"])
 * @param opts.publicOnly  기본 true — isPublic === false 만 제외. undefined 는 통과 (legacy 호환).
 * @param opts.availableOnly  기본 true — isAvailable === false 만 제외.
 */
export async function listMasterItemsByCategoryFilter(
  categories: readonly ItemCategory[],
  opts: { publicOnly?: boolean; availableOnly?: boolean } = {},
): Promise<MasterItem[]> {
  const all = await listMasterItems();
  const { publicOnly = true, availableOnly = true } = opts;
  return all.filter(
    (it) =>
      categories.includes(it.category) &&
      (!publicOnly || it.isPublic !== false) &&
      (!availableOnly || it.isAvailable !== false),
  );
}
