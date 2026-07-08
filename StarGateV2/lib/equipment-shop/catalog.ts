import type { ItemCategory, MasterItem } from "@stargate/shared-db/types";

export const EQUIPMENT_SHOP_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "CONSUMABLE",
  "SPECIAL",
] as const satisfies readonly ItemCategory[];

export type EquipmentShopCategory = (typeof EQUIPMENT_SHOP_CATEGORIES)[number];
export type EquipmentShopZone = "towaski" | "acheron" | "strategic";

export interface EquipmentShopCatalogItem {
  key: string;
  slug?: string;
  name: string;
  category: EquipmentShopCategory;
  zone: EquipmentShopZone;
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
  CONSUMABLE: "소모품",
  SPECIAL: "전략 자산",
};

const ARMORY_TAG_KEYWORDS = ["병기부"];

const TOWASKI_CONSUMABLE_TAG_KEYWORDS = [
  "토와스키",
  "토와스키건샵",
  "토와스키 건샵",
  "폭발형무기",
  "폭발형 무기",
  "투척무기",
  "투척 무기",
  "수류탄",
];

const STRATEGIC_TAG_KEYWORDS = [
  "병기부",
  "전략자산",
  "전략 자산",
  "차량",
  "전투보조",
  "전투 보조",
];

const ACHERON_TAG_KEYWORDS = [
  "아케론",
  "아케론대장간",
  "아케론 대장간",
  "근접무기",
  "근접 무기",
  "냉병기",
  "장검류",
  "둔기류",
];

export function isEquipmentShopCategory(
  category: ItemCategory,
): category is EquipmentShopCategory {
  return (EQUIPMENT_SHOP_CATEGORIES as readonly ItemCategory[]).includes(
    category,
  );
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function hasNormalizedTag(
  normalizedTags: Set<string>,
  keywords: readonly string[],
): boolean {
  return keywords.some((keyword) => normalizedTags.has(normalizeTag(keyword)));
}

export function equipmentShopItemZone(
  item: Pick<MasterItem, "category" | "tags">,
): EquipmentShopZone | null {
  const normalizedTags = new Set((item.tags ?? []).map(normalizeTag));

  if (item.category === "WEAPON" || item.category === "ARMOR") {
    const acheron = ACHERON_TAG_KEYWORDS.some((keyword) =>
      normalizedTags.has(normalizeTag(keyword)),
    );
    if (acheron) return "acheron";
    return "towaski";
  }

  if (item.category === "CONSUMABLE") {
    const isArmoryConsumable = hasNormalizedTag(
      normalizedTags,
      ARMORY_TAG_KEYWORDS,
    );
    const isTowaskiConsumable = hasNormalizedTag(
      normalizedTags,
      TOWASKI_CONSUMABLE_TAG_KEYWORDS,
    );
    return isArmoryConsumable && isTowaskiConsumable ? "towaski" : null;
  }

  if (item.category !== "SPECIAL") return null;

  const strategic = hasNormalizedTag(normalizedTags, STRATEGIC_TAG_KEYWORDS);
  return strategic ? "strategic" : null;
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
    item.damage
      ? item.category === "ARMOR"
        ? item.damage
        : `피해 ${item.damage}`
      : null,
    item.effect?.trim() || null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ") || CATEGORY_LABELS[item.category as EquipmentShopCategory];
}

export function toEquipmentShopCatalogItem(
  item: MasterItem,
): EquipmentShopCatalogItem | null {
  if (!isEquipmentShopCategory(item.category)) return null;

  const zone = equipmentShopItemZone(item);
  if (!zone) return null;

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
    zone,
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
