import type { MasterItem } from "@stargate/shared-db/types";

import type { PublicMasterItemDto } from "@/types/inventory";

/** 저장소 문서 대신 공개 카탈로그 UI에 필요한 필드만 반환한다. */
export function toPublicMasterItemDto(
  item: MasterItem,
): PublicMasterItemDto {
  return {
    _id: item._id?.toString() ?? "",
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    price: item.price,
    damage: item.damage,
    effect: item.effect,
    isAvailable: item.isAvailable,
    nameEn: item.nameEn,
    tags: item.tags,
    previewImage: item.previewImage,
    isPublic: item.isPublic,
  };
}
