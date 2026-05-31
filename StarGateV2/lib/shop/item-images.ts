export const SHOP_ITEM_IMAGE_BASE_PATH = "/assets/shop/items" as const;

export const SHOP_ITEM_IMAGE_BY_SLUG = {
  cup_ramen: `${SHOP_ITEM_IMAGE_BASE_PATH}/cup_ramen.png`,
  soda: `${SHOP_ITEM_IMAGE_BASE_PATH}/soda.png`,
  coffee: `${SHOP_ITEM_IMAGE_BASE_PATH}/coffee.png`,
  first_aid_patch: `${SHOP_ITEM_IMAGE_BASE_PATH}/first_aid_patch.png`,
  calm_mint: `${SHOP_ITEM_IMAGE_BASE_PATH}/calm_mint.png`,
  field_nutrition_gel: `${SHOP_ITEM_IMAGE_BASE_PATH}/field_nutrition_gel.png`,
  energy_bar: `${SHOP_ITEM_IMAGE_BASE_PATH}/energy_bar.png`,
  hotpack: `${SHOP_ITEM_IMAGE_BASE_PATH}/hotpack.png`,
  chocolate: `${SHOP_ITEM_IMAGE_BASE_PATH}/chocolate.png`,
  beer_pack: `${SHOP_ITEM_IMAGE_BASE_PATH}/beer_pack.png`,
  cig_1: `${SHOP_ITEM_IMAGE_BASE_PATH}/cig_1.png`,
  cig_5: `${SHOP_ITEM_IMAGE_BASE_PATH}/cig_5.png`,
  liquor: `${SHOP_ITEM_IMAGE_BASE_PATH}/liquor.png`,
  icecream: `${SHOP_ITEM_IMAGE_BASE_PATH}/icecream.png`,
  force_core: `${SHOP_ITEM_IMAGE_BASE_PATH}/force_core.png`,
  vf_blood: `${SHOP_ITEM_IMAGE_BASE_PATH}/vf_blood.png`,
} as const satisfies Record<string, string>;

export function getShopItemImageSrc(slug: string): string | undefined {
  return SHOP_ITEM_IMAGE_BY_SLUG[
    slug as keyof typeof SHOP_ITEM_IMAGE_BY_SLUG
  ];
}
