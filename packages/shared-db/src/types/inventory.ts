import type { ObjectId } from "mongodb";

/**
 * MasterItem.category 의 단일 출처 (SSOT).
 * Zod enum 도 동일 배열로부터 유도하여 type/schema 가 절대 lag 하지 않도록 한다.
 * - 신규 카테고리 추가 시 이 배열만 수정 → `ItemCategory` 타입과 모든 schema enum 이 자동 반영됨
 */
export const ITEM_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "CONSUMABLE",
  "MATERIAL",
  "SPECIAL",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/**
 * 편의점 페이지 그룹 — tia_bot `SHOP_PAGES` 와 정합.
 * 신규 카탈로그 인입 시에만 채움. 비편의점 아이템은 undefined.
 */
export type ShopPageGroup = "BASIC" | "RECOVERY" | "LUXURY" | "RARE";

/**
 * 편의점 전용 메타.
 *
 * - stockMin/stockMax: 일자별 재고 시드 범위 (KST 일자 단위).
 * - appearRate: 0.0 ~ 1.0. 0 이면 항상 품절(VF혈액팩 같은 fluff).
 * - color: tia_bot 의 RGB tuple 을 hex 문자열(#RRGGBB) 로 변환.
 * - pageGroup: 페이지 분류. 미지정 시 기본 BASIC 으로 노출 가능.
 */
export interface ShopMeta {
  stockMin: number;
  stockMax: number;
  appearRate: number;
  color?: string;
  pageGroup?: ShopPageGroup;
}

export interface MasterItem {
  _id?: ObjectId;
  /**
   * 편의점 아이템 안정 식별자 (예: "cup_ramen").
   * 기존 row 는 비어 있을 수 있음. 신규 시드/카탈로그 인입 시에만 채움.
   * unique sparse index 가 걸려 있어 중복 방지 (인덱스명: master_items_slug_unique).
   */
  slug?: string;
  name: string;
  category: ItemCategory;
  description: string;
  price: number | string;
  damage?: string;
  effect?: string;
  /** 편의점 전용 메타. 비편의점 아이템은 undefined. */
  shopMeta?: ShopMeta;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
  /* ── equipment / consumable 카탈로그 mirror 필드 (optional) ──
     spec MD frontmatter + body 섹션을 master_items 에 적재할 때 사용.
     기존 비편의점/편의점 row 는 모두 undefined 로 유지되며 backward-compatible. */
  nameEn?: string;
  tags?: string[];
  previewImage?: string;
  isPublic?: boolean;
  lore?: {
    background?: string;
    acquisition?: string;
    notes?: string;
  };
  loreMd?: string;
  source?: "discord" | "legacy-json" | "manual" | "create-lore";
  authorId?: string;
  authorName?: string;
}

export interface CharacterInventory {
  _id?: ObjectId;
  characterId: string;
  characterCodename: string;
  itemId: string;
  itemName: string;
  quantity: number;
  acquiredAt: Date;
  note?: string;
}

export type CreateMasterItemInput = Omit<
  MasterItem,
  "_id" | "createdAt" | "updatedAt"
>;

export type CreateInventoryInput = Omit<CharacterInventory, "_id">;
