import type { ItemCategory } from "@stargate/shared-db/types";

export const CATALOG_SCOPES = [
  "all",
  "equipment",
  "consumable",
  "sample",
  "special",
] as const;

export type CatalogScope = (typeof CATALOG_SCOPES)[number];
export type CatalogItemScope = Exclude<CatalogScope, "all">;

export const CATALOG_SCOPE_CATEGORIES: Record<CatalogScope, ItemCategory[]> = {
  all: ["WEAPON", "ARMOR", "CONSUMABLE", "MATERIAL", "SPECIAL"],
  equipment: ["WEAPON", "ARMOR"],
  consumable: ["CONSUMABLE"],
  sample: ["MATERIAL"],
  special: ["SPECIAL"],
};

export const CATALOG_SCOPE_LABEL: Record<CatalogScope, string> = {
  all: "전체",
  equipment: "장비",
  consumable: "소모품",
  sample: "샘플",
  special: "특수",
};

export const CATALOG_SCOPE_TITLE: Record<CatalogScope, string> = {
  all: "카탈로그",
  equipment: "장비 카탈로그",
  consumable: "소모품 카탈로그",
  sample: "샘플 카탈로그",
  special: "특수 카탈로그",
};

export const CATALOG_SCOPE_HREF: Record<CatalogScope, string> = {
  all: "/erp/wiki/catalog/all",
  equipment: "/erp/wiki/catalog/equipment",
  consumable: "/erp/wiki/catalog/consumable",
  sample: "/erp/wiki/catalog/sample",
  special: "/erp/wiki/catalog/special",
};

export const CATALOG_TABS = CATALOG_SCOPES.map((scope) => ({
  key: scope,
  label: CATALOG_SCOPE_LABEL[scope],
  href: CATALOG_SCOPE_HREF[scope],
}));

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "샘플",
  SPECIAL: "특수",
};

export const ITEM_CATEGORY_OPTIONS: {
  value: ItemCategory;
  label: string;
  scope: CatalogItemScope;
}[] = [
  { value: "WEAPON", label: "무기", scope: "equipment" },
  { value: "ARMOR", label: "방어구", scope: "equipment" },
  { value: "CONSUMABLE", label: "소모품", scope: "consumable" },
  { value: "MATERIAL", label: "샘플", scope: "sample" },
  { value: "SPECIAL", label: "특수", scope: "special" },
];

export type CatalogTone = CatalogItemScope;

export function normalizeCatalogScope(value: string): CatalogScope | null {
  if (value === "material") return "sample";
  return CATALOG_SCOPES.includes(value as CatalogScope)
    ? (value as CatalogScope)
    : null;
}

export function catalogScopeForItemCategory(
  category: ItemCategory,
): CatalogItemScope {
  if (category === "WEAPON" || category === "ARMOR") return "equipment";
  if (category === "CONSUMABLE") return "consumable";
  if (category === "MATERIAL") return "sample";
  return "special";
}

export function categoryTone(category: ItemCategory): CatalogTone {
  return catalogScopeForItemCategory(category);
}
