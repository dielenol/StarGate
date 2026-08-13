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

export const EQUIPMENT_ITEM_IMAGE_BY_SLUG = {
  "basic-advanced-ballistic-vest": catalogAsset(
    "equipment",
    "basic-advanced-ballistic-vest",
  ),
  "basic-assault-rifle": catalogAsset("equipment", "basic-assault-rifle"),
  "basic-assault-shield": catalogAsset("equipment", "basic-assault-shield"),
  "basic-blunt-weapon": catalogAsset("equipment", "basic-blunt-weapon"),
  "basic-chainsaw": catalogAsset("equipment", "basic-chainsaw"),
  "basic-dagger": catalogAsset("equipment", "basic-dagger"),
  "basic-flamethrower": catalogAsset("equipment", "basic-flamethrower"),
  "basic-heavy-machine-gun": catalogAsset(
    "equipment",
    "basic-heavy-machine-gun",
  ),
  "basic-intermediate-ballistic-vest": catalogAsset(
    "equipment",
    "basic-intermediate-ballistic-vest",
  ),
  "basic-katana": catalogAsset("equipment", "basic-katana"),
  "basic-longsword": catalogAsset("equipment", "basic-longsword"),
  "basic-pistol": catalogAsset("equipment", "basic-pistol"),
  "basic-shotgun": catalogAsset("equipment", "basic-shotgun"),
  "basic-sniper-rifle": catalogAsset("equipment", "basic-sniper-rifle"),
  "basic-sonic-emitter": catalogAsset("equipment", "basic-sonic-emitter"),
  "basic-standard-ballistic-vest": catalogAsset(
    "equipment",
    "basic-standard-ballistic-vest",
  ),
  "cmmg-mk47-mutant-nosb-mod": catalogAsset(
    "equipment",
    "cmmg-mk47-mutant-nosb-mod",
  ),
  "cmmg-mk47-mutant-pian-bulwark": catalogAsset(
    "equipment",
    "cmmg-mk47-mutant-pian-bulwark",
  ),
  "conchita-of-gluttony": catalogAsset("equipment", "conchita-of-gluttony"),
  "conchita-of-gluttony-modified": catalogAsset(
    "equipment",
    "conchita-of-gluttony-modified",
  ),
  "assault-shield-claymore-modified": catalogAsset(
    "equipment",
    "assault-shield-claymore-modified",
  ),
  "assault-shield-claymore-modified-v2": catalogAsset(
    "equipment",
    "assault-shield-claymore-modified-v2",
  ),
  "military-fragment-grenade": catalogAsset(
    "equipment",
    "military-fragment-grenade",
  ),
  "old-tactical-sword-titanium-shield": catalogAsset(
    "equipment",
    "old-tactical-sword-titanium-shield",
  ),
  "rocket-launcher": catalogAsset("equipment", "rocket-launcher"),
  "tactical-claymore": catalogAsset("equipment", "tactical-claymore"),
} as const satisfies Record<string, string>;

export const CATALOG_ITEM_IMAGE_BY_SLUG = {
  ...CONSUMABLE_ITEM_IMAGE_BY_SLUG,
  ...EQUIPMENT_ITEM_IMAGE_BY_SLUG,
  "aurora-virus-black-smoke-sample": catalogAsset(
    "samples",
    "aurora-virus-black-smoke-sample",
  ),
  "cold-emitter": catalogAsset("special", "cold-emitter"),
  kimite: catalogAsset("special", "kimite"),
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
