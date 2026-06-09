import type { ItemCategory, MasterItem } from "@stargate/shared-db/types";

export const EQUIPMENT_SHOP_CATEGORIES = ["WEAPON", "ARMOR"] as const satisfies readonly ItemCategory[];

export type EquipmentShopCategory = (typeof EQUIPMENT_SHOP_CATEGORIES)[number];

export interface EquipmentShopCatalogItem {
  key: string;
  slug?: string;
  name: string;
  category: EquipmentShopCategory;
  price: number;
  effect: string;
  description: string;
  damage?: string;
  previewImage?: string;
  stock: number;
  available: boolean;
}

const CATEGORY_LABELS: Record<EquipmentShopCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
};

export function isEquipmentShopCategory(
  category: ItemCategory,
): category is EquipmentShopCategory {
  return (EQUIPMENT_SHOP_CATEGORIES as readonly ItemCategory[]).includes(
    category,
  );
}

export function equipmentShopItemKey(item: MasterItem): string | null {
  const slug = item.slug?.trim();
  if (slug) return slug;
  if (item._id) return String(item._id);
  return null;
}

export function toEquipmentPriceNumber(
  price: MasterItem["price"],
): number | null {
  const parsed =
    typeof price === "number" && Number.isFinite(price) ? price : Number(price);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function equipmentEffect(item: MasterItem): string {
  const parts = [
    item.damage ? `피해 ${item.damage}` : null,
    item.effect?.trim() || null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ") || CATEGORY_LABELS[item.category as EquipmentShopCategory];
}

export function toEquipmentShopCatalogItem(
  item: MasterItem,
): EquipmentShopCatalogItem | null {
  if (!isEquipmentShopCategory(item.category)) return null;

  const key = equipmentShopItemKey(item);
  if (!key) return null;

  const price = toEquipmentPriceNumber(item.price);
  const available =
    item.isAvailable !== false && item.isPublic !== false && price !== null;

  return {
    key,
    ...(item.slug ? { slug: item.slug } : {}),
    name: item.name,
    category: item.category,
    price: price ?? 0,
    effect: equipmentEffect(item),
    description:
      item.description ||
      `${CATEGORY_LABELS[item.category]} 카탈로그에 등록된 장비입니다.`,
    ...(item.damage ? { damage: item.damage } : {}),
    ...(item.previewImage ? { previewImage: item.previewImage } : {}),
    stock: available ? 1 : 0,
    available,
  };
}
