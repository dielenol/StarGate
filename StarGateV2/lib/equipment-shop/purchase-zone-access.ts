import type {
  EquipmentShopCategory,
  EquipmentShopZone,
} from "./catalog";

interface EquipmentShopZoneMatchInput {
  purchaseZone: EquipmentShopZone;
  sourceZone: EquipmentShopZone;
  category: EquipmentShopCategory;
}

interface EquipmentShopOperationalAccessInput {
  isGM: boolean;
  hasPlayerServiceTestAccess: boolean;
  hasLocalPreviewAccess: boolean;
  pageLocked: boolean;
}

export function isAcheronSharedArmorZone(
  input: EquipmentShopZoneMatchInput,
): boolean {
  return (
    input.purchaseZone === "acheron" &&
    input.sourceZone === "towaski" &&
    input.category === "ARMOR"
  );
}

export function isEquipmentShopCatalogZoneMatch(
  input: EquipmentShopZoneMatchInput,
): boolean {
  return (
    input.purchaseZone === input.sourceZone || isAcheronSharedArmorZone(input)
  );
}

export function hasEquipmentShopZonePurchaseAccess(
  input: EquipmentShopZoneMatchInput,
): boolean {
  return isEquipmentShopCatalogZoneMatch(input);
}

export function hasEquipmentShopOperationalAccess(
  input: EquipmentShopOperationalAccessInput,
): boolean {
  return (
    input.isGM ||
    input.hasPlayerServiceTestAccess ||
    input.hasLocalPreviewAccess ||
    !input.pageLocked
  );
}

export function requiresTowaskiBasicLicense(
  purchaseZone: EquipmentShopZone,
): boolean {
  return purchaseZone === "towaski";
}
