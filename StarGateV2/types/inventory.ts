/**
 * @deprecated shared-db에서 직접 import하세요.
 */

import type { MasterItem as SharedMasterItem } from "@stargate/shared-db/types";

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

/** 공개 카탈로그 목록에서 사용하는 표시 전용 아이템 계약. */
export type PublicMasterItemDto = Pick<
  SharedMasterItem,
  | "slug"
  | "name"
  | "category"
  | "description"
  | "price"
  | "damage"
  | "effect"
  | "isAvailable"
  | "nameEn"
  | "tags"
  | "previewImage"
  | "isPublic"
> & {
  _id: string;
};

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
  equipmentActions?: import("@stargate/shared-db/types").EquipmentAction[];
  combatProfile?: import("@stargate/shared-db/types").EquipmentCombatProfile;
  equipmentAbilityOverrides?: import("@stargate/shared-db/types").EquipmentAbilityOverride[];
  equipmentCharge?: import("@stargate/shared-db/types").EquipmentChargeState;
  equipmentCharges?: Record<
    string,
    import("@stargate/shared-db/types").EquipmentChargeState
  >;
  equipmentAmmo?: import("@stargate/shared-db/types").EquipmentChargeState;
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
