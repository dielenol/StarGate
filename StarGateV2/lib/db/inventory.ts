/**
 * master_items + character_inventory CRUD
 */

import { ObjectId } from "mongodb";

import type {
  CharacterInventory,
  CreateInventoryInput,
  CreateMasterItemInput,
  MasterItem,
} from "@/types/inventory";

import { inventoryCollection, masterItemsCollection } from "./collections";

/* ── Master Items ── */

export async function listMasterItems(): Promise<MasterItem[]> {
  const col = await masterItemsCollection();
  return col.find().sort({ category: 1, name: 1 }).toArray();
}

export async function listAvailableItems(): Promise<MasterItem[]> {
  const col = await masterItemsCollection();
  return col
    .find({ isAvailable: true })
    .sort({ category: 1, name: 1 })
    .toArray();
}

export async function findMasterItemById(
  id: string,
): Promise<MasterItem | null> {
  const col = await masterItemsCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function createMasterItem(
  input: CreateMasterItemInput,
): Promise<MasterItem> {
  const col = await masterItemsCollection();
  const now = new Date();
  const doc: MasterItem = { ...input, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateMasterItem(
  id: string,
  update: Record<string, unknown>,
): Promise<boolean> {
  const col = await masterItemsCollection();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } as Record<string, unknown> },
  );
  return result.modifiedCount > 0;
}

export async function deleteMasterItem(id: string): Promise<boolean> {
  const col = await masterItemsCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/* ── Character Inventory ── */

export async function listCharacterInventory(
  characterId: string,
): Promise<CharacterInventory[]> {
  const col = await inventoryCollection();
  return col.find({ characterId }).sort({ acquiredAt: -1 }).toArray();
}

export async function addToInventory(
  input: CreateInventoryInput,
): Promise<CharacterInventory> {
  const col = await inventoryCollection();

  // upsert로 원자적 처리 — 동시 요청 시 중복 문서 방지
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
    { upsert: true, returnDocument: "after" },
  );
  return result!;
}

export async function removeFromInventory(
  characterId: string,
  itemId: string,
  quantity: number,
): Promise<boolean> {
  const col = await inventoryCollection();
  const existing = await col.findOne({ characterId, itemId });
  if (!existing) return false;

  if (existing.quantity <= quantity) {
    await col.deleteOne({ _id: existing._id });
  } else {
    await col.updateOne(
      { _id: existing._id },
      { $inc: { quantity: -quantity } },
    );
  }
  return true;
}

export async function deleteInventoryEntry(id: string): Promise<boolean> {
  const col = await inventoryCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
