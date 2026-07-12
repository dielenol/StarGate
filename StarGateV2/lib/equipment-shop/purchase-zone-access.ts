import type {
  EquipmentShopCategory,
  EquipmentShopZone,
} from "./catalog";

interface EquipmentShopZoneAccessInput {
  isGM: boolean;
  purchaseZone: EquipmentShopZone;
  sourceZone: EquipmentShopZone;
  category: EquipmentShopCategory;
}

type EquipmentShopZoneMatchInput = Omit<
  EquipmentShopZoneAccessInput,
  "isGM"
>;

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
  input: EquipmentShopZoneAccessInput,
): boolean {
  if (!isEquipmentShopCatalogZoneMatch(input)) return false;
  return input.isGM || input.purchaseZone !== "strategic";
}

export function requiresTowaskiBasicLicense(
  purchaseZone: EquipmentShopZone,
): boolean {
  return purchaseZone === "towaski";
}
