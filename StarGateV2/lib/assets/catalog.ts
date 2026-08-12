import { buildStarGateV2AssetPath } from "./spec.ts";
import { SHOP_ITEM_IMAGE_BY_SLUG } from "./shop.ts";

const catalogAsset = (
  category: "consumables" | "equipment" | "samples" | "special",
  entitySlug: string,
  format: "png" | "svg" | "webp" = "webp",
) =>
  buildStarGateV2AssetPath({
    domain: "catalog",
    category,
    entitySlug,
    format,
  });

export const CONSUMABLE_ITEM_IMAGE_BY_SLUG = {
  ...SHOP_ITEM_IMAGE_BY_SLUG,
  stimpack: catalogAsset("consumables", "stimpack"),
} as const satisfies Record<string, string>;

export const CATALOG_ITEM_IMAGE_BY_SLUG = {
  ...CONSUMABLE_ITEM_IMAGE_BY_SLUG,
  "aurora-virus-black-smoke-sample": catalogAsset(
    "samples",
    "aurora-virus-black-smoke-sample",
  ),
  "cold-emitter": catalogAsset("special", "cold-emitter"),
  kimite: catalogAsset("special", "kimite"),
  "conchita-of-gluttony-modified": catalogAsset(
    "equipment",
    "conchita-of-gluttony-modified",
  ),
  "assault-shield-claymore-modified-v2": catalogAsset(
    "equipment",
    "assault-shield-claymore-modified-v2",
  ),
  "cmmg-mk47-mutant-pian-bulwark": catalogAsset(
    "equipment",
    "cmmg-mk47-mutant-pian-bulwark",
  ),
} as const satisfies Record<string, string>;

export function getConsumableItemImageSrc(slug: string): string | undefined {
  return CONSUMABLE_ITEM_IMAGE_BY_SLUG[
    slug as keyof typeof CONSUMABLE_ITEM_IMAGE_BY_SLUG
  ];
}

export function getCatalogItemImageSrc(slug: string): string | undefined {
  return CATALOG_ITEM_IMAGE_BY_SLUG[
    slug as keyof typeof CATALOG_ITEM_IMAGE_BY_SLUG
  ];
}
