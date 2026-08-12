import type { TiaMood } from "../shop/tia-dialogue.ts";

import { buildStarGateV2AssetPath } from "./spec.ts";

export const SHOP_ITEM_IMAGE_BASE_PATH = "/assets/shop/items" as const;

const shopItem = (entitySlug: string) =>
  buildStarGateV2AssetPath({
    domain: "shop",
    section: "items",
    entitySlug,
  });

const shopHud = (entitySlug: string) =>
  buildStarGateV2AssetPath({ domain: "shop", section: "hud", entitySlug });

const shopEvent = (entitySlug: string) =>
  buildStarGateV2AssetPath({
    domain: "shop",
    section: "events",
    entitySlug,
  });

export const SHOP_ITEM_IMAGE_BY_SLUG = {
  cup_ramen: shopItem("cup_ramen"),
  soda: shopItem("soda"),
  coffee: shopItem("coffee"),
  first_aid_patch: shopItem("first_aid_patch"),
  calm_mint: shopItem("calm_mint"),
  field_nutrition_gel: shopItem("field_nutrition_gel"),
  energy_bar: shopItem("energy_bar"),
  hotpack: shopItem("hotpack"),
  chocolate: shopItem("chocolate"),
  beer_pack: shopItem("beer_pack"),
  cig_1: shopItem("cig_1"),
  cig_5: shopItem("cig_5"),
  liquor: shopItem("liquor"),
  icecream: shopItem("icecream"),
  force_core: shopItem("force_core"),
  vf_blood: shopItem("vf_blood"),
  mrbeast_soda: shopItem("mrbeast_soda"),
} as const satisfies Record<string, string>;

export const TIA_PROFILE_SRC = shopHud("tia-profile");
export const TIA_MOOD_ASSETS = {
  welcome: shopHud("tia-welcome"),
  tired: shopHud("tia-tired"),
  soldout: shopHud("tia-soldout"),
  bag: shopHud("tia-bag"),
  doodle: shopHud("tia-doodle"),
  purchase: shopHud("tia-purchase-complete"),
  nap: shopHud("tia-nap"),
} as const satisfies Record<TiaMood, string>;

export const MRBEAST_SODA_POSTER_SRC = shopEvent(
  "mrbeast-soda-lottery-poster",
);
export const MRBEAST_LOTTERY_SRC = shopEvent("mrbeast-lottery-transparent");
export const MRBEAST_SODA_SRC = SHOP_ITEM_IMAGE_BY_SLUG.mrbeast_soda;

export function getShopItemImageSrc(slug: string): string | undefined {
  return SHOP_ITEM_IMAGE_BY_SLUG[
    slug as keyof typeof SHOP_ITEM_IMAGE_BY_SLUG
  ];
}
