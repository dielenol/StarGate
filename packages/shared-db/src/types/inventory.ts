import type { ObjectId } from "mongodb";

export type ItemCategory =
  | "WEAPON"
  | "ARMOR"
  | "CONSUMABLE"
  | "MATERIAL"
  | "SPECIAL";

export interface MasterItem {
  _id?: ObjectId;
  name: string;
  category: ItemCategory;
  description: string;
  price: number | string;
  damage?: string;
  effect?: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterInventory {
  _id?: ObjectId;
  characterId: string;
  characterCodename: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: Date;
  note?: string;
}

export type CreateMasterItemInput = Omit<
  MasterItem,
  "_id" | "createdAt" | "updatedAt"
>;

export type CreateInventoryInput = Omit<CharacterInventory, "_id">;
