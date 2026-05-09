/**
 * master_items + character_inventory CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CharacterInventory,
  CreateInventoryInput,
  CreateMasterItemInput,
  MasterItem,
} from "../types/index.js";

import {
  characterInventoryCol,
  masterItemsCol,
} from "../collections.js";

/* ── Master Items ── */

export async function listMasterItems(): Promise<MasterItem[]> {
  const col = await masterItemsCol();
  return col.find().sort({ category: 1, name: 1 }).toArray();
}

export async function listAvailableItems(): Promise<MasterItem[]> {
  const col = await masterItemsCol();
  return col
    .find({ isAvailable: true })
    .sort({ category: 1, name: 1 })
    .toArray();
}

export async function findMasterItemById(id: string): Promise<MasterItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await masterItemsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

/**
 * 편의점 카탈로그 slug 로 master_items 조회.
 *
 * `seed-shop-catalog.ts` 가 slug 기준 upsert 한 row 를 끌어온다.
 * - 미존재 시 null (시드 미실행 또는 catalog drift 상황 — 호출자가 안내).
 * - slug 가 빈 문자열 / 공백이면 null (방어).
 */
export async function findMasterItemBySlug(
  slug: string
): Promise<MasterItem | null> {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  const col = await masterItemsCol();
  return col.findOne({ slug: trimmed });
}

/**
 * 여러 slug 의 master_items 를 한 번에 조회 — projection { _id, slug } 만.
 *
 * 용도: 편의점 inventory 응답에서 character_inventory.itemId(=master._id) → slug 역매핑.
 * 빈 배열 입력은 즉시 short-circuit.
 */
export async function findMasterItemsBySlugs(
  slugs: string[]
): Promise<Pick<MasterItem, "_id" | "slug">[]> {
  if (slugs.length === 0) return [];
  const col = await masterItemsCol();
  return col
    .find(
      { slug: { $in: slugs } },
      { projection: { _id: 1, slug: 1 } }
    )
    .toArray();
}

export async function createMasterItem(
  input: CreateMasterItemInput
): Promise<MasterItem> {
  const col = await masterItemsCol();
  const now = new Date();
  const doc: MasterItem = { ...input, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateMasterItem(
  id: string,
  update: Record<string, unknown>
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await masterItemsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } as Record<string, unknown> }
  );
  return result.modifiedCount > 0;
}

export async function deleteMasterItem(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await masterItemsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/* ── Character Inventory ── */

export async function listCharacterInventory(
  characterId: string
): Promise<CharacterInventory[]> {
  const col = await characterInventoryCol();
  return col.find({ characterId }).sort({ acquiredAt: -1 }).toArray();
}

export async function addToInventory(
  input: CreateInventoryInput
): Promise<CharacterInventory> {
  const col = await characterInventoryCol();

  const result = await col.findOneAndUpdate(
    { characterId: input.characterId, itemId: input.itemId },
    {
      $inc: { quantity: input.quantity },
      $setOnInsert: {
        characterCodename: input.characterCodename,
        itemName: input.itemName,
        acquiredAt: input.acquiredAt,
        note: input.note,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!result) {
    throw new Error(
      `Failed to upsert inventory: characterId=${input.characterId}, itemId=${input.itemId}`
    );
  }
  return result;
}

/**
 * character_inventory 에서 quantity 만큼 atomic 차감.
 *
 * - `quantity: { $gte: quantity }` 매치로 race condition 차단
 *   (동시 consume 두 건이 동일 row 에 들어와도 음수 quantity 발생 안 함).
 * - 차감 후 quantity 가 0 이면 race-aware deleteOne 으로 row 정리
 *   (다른 호출이 그 사이 +qty 했으면 quantity:0 매치 안 되어 보존됨).
 * - 보유 부족 시 `{ ok: false, remaining: 0 }`.
 * - 정상 차감 시 `{ ok: true, remaining: <차감 후 quantity> }`.
 */
export async function removeFromInventory(
  characterId: string,
  itemId: string,
  quantity: number
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(
      `removeFromInventory: quantity must be a positive integer, got ${quantity}`
    );
  }
  const col = await characterInventoryCol();
  const result = await col.findOneAndUpdate(
    { characterId, itemId, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { returnDocument: "after" }
  );
  if (!result) return { ok: false, remaining: 0 };
  if (result.quantity === 0) {
    // race-aware: 다른 요청이 이미 inc 했을 수 있으므로 quantity:0 추가 매치.
    await col.deleteOne({ _id: result._id, quantity: 0 });
  }
  return { ok: true, remaining: result.quantity };
}

export async function deleteInventoryEntry(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await characterInventoryCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
