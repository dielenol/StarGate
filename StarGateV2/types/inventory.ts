/**
 * @deprecated shared-db에서 직접 import하세요.
 */

export type {
  MasterItem,
  CharacterInventory,
  SharedInventory,
  SharedInventoryScope,
  ItemCategory,
  CreateMasterItemInput,
  CreateInventoryInput,
  CreateSharedInventoryInput,
  EquipmentSlot,
} from "@stargate/shared-db/types";

export interface InventoryEntryDto {
  _id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: string;
  note?: string;
  category: import("@stargate/shared-db/types").ItemCategory | null;
  slug?: string;
  effect?: string;
  damage?: string;
  description?: string;
  price?: number | string;
  previewImage?: string;
  isPublic?: boolean;
  tags?: string[];
  equipmentAction?: import("@stargate/shared-db/types").EquipmentAction;
  equipmentCharge?: import("@stargate/shared-db/types").EquipmentChargeState;
  workshop?: import("@stargate/shared-db/types").MasterItem["workshop"];
  equippedSlot?: import("@stargate/shared-db/types").EquipmentSlot;
  equippedAt?: string;
}

export interface RemoveInventoryInput {
  itemId: string;
  quantity: number;
}

export type CharacterInventoryDto = Omit<
  import("@stargate/shared-db/types").CharacterInventory,
  "_id" | "acquiredAt" | "equippedAt"
> & {
  _id?: string;
  acquiredAt: string;
  equippedAt?: string;
};

export interface CharacterInventoryResponse {
  inventory: CharacterInventoryDto[];
  entries: InventoryEntryDto[];
  equipped: Partial<
    Record<
      import("@stargate/shared-db/types").EquipmentSlot,
      InventoryEntryDto
    >
  >;
}
