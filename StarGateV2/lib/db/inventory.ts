/**
 * inventory CRUD — shared-db로 이전됨 (shim)
 */

import "./init";

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
