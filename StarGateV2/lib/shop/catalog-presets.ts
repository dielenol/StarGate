import type { ItemCategory, ShopPageGroup } from "@stargate/shared-db";

import type {
  ArmoryZone,
  CatalogTarget,
} from "@/lib/shop/catalog-item-input";

export interface CatalogItemPresetForm {
  target: CatalogTarget;
  armoryZone: ArmoryZone;
  category: ItemCategory;
  slug: string;
  name: string;
  price: string;
  description: string;
  damage: string;
  effect: string;
  previewImage: string;
  tags: string;
  isAvailable: boolean;
  isPublic: boolean;
  stockMin: string;
  stockMax: string;
  appearRate: string;
  pageGroup: ShopPageGroup;
  icon: string;
  color: string;
}

export interface CatalogItemPreset {
  key: string;
  displayName: string;
  summary: string;
  sourceLabel: string;
  form: CatalogItemPresetForm;
}

export const CATALOG_ITEM_PRESET_PREFIX = "preset:";

export const CATALOG_ITEM_PRESETS: readonly CatalogItemPreset[] = [
  {
    key: "mrbeast-soda-recovery",
    displayName: "미스터비스트 소다",
    summary:
      "HP 10 · SAN 10 회복 / 80 CR / 회복 품목 / 재고 2~5 / 등장률 0.75",
    sourceLabel: "사용자 협의 · 기존 편의점 회복 효율 기준 밸런스 후보",
    form: {
      target: "shop",
      armoryZone: "towaski",
      category: "CONSUMABLE",
      slug: "mrbeast_soda",
      name: "미스터비스트 소다",
      price: "80",
      description:
        "톡 쏘는 탄산과 강한 에너지 향으로 몸과 정신을 함께 끌어올리는 한정 소다.",
      damage: "",
      effect: "HP 10 / SAN 10 회복",
      previewImage: "/assets/shop/items/mrbeast_soda.png",
      tags: "편의점, 회복, 소다, 미스터비스트",
      isAvailable: true,
      isPublic: true,
      stockMin: "2",
      stockMax: "5",
      appearRate: "0.75",
      pageGroup: "RECOVERY",
      icon: "🥤",
      color: "#3068b0",
    },
  },
] as const;

export function getCatalogItemPresetSelectionValue(key: string): string {
  return `${CATALOG_ITEM_PRESET_PREFIX}${key}`;
}

export function findCatalogItemPreset(
  selectionValue: string,
): CatalogItemPreset | undefined {
  if (!selectionValue.startsWith(CATALOG_ITEM_PRESET_PREFIX)) {
    return undefined;
  }
  const key = selectionValue.slice(CATALOG_ITEM_PRESET_PREFIX.length);
  return CATALOG_ITEM_PRESETS.find((preset) => preset.key === key);
}
