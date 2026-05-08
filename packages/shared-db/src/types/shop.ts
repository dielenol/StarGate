import type { ObjectId } from "mongodb";

/**
 * 편의점(shop) 사용자 보유 인벤토리.
 * tia_bot 의 user 단위 소모성 구매물 저장소.
 *
 * 도메인 분리: 본 컬렉션은 character_inventory 와 무관.
 * - character_inventory: 캐릭터(에이전트) 단위 장비/소지품
 * - shop_inventory: 사용자(User) 단위 편의점 구매물
 *
 * userId 는 User._id.toHexString() (ObjectId 문자열).
 */
export interface ShopInventory {
  _id?: ObjectId;
  userId: string;
  itemId: string;
  quantity: number;
  updatedAt: Date;
}

export type CreateShopInventoryInput = Omit<ShopInventory, "_id">;

/**
 * 편의점 당일 재고 (item별).
 *
 * lastRefresh: KST 기준 'YYYY-MM-DD' 날짜 문자열.
 *   UTC Date 를 사용하지 않는다 (KST 기준 일자 변경 + 봇 코드와 정합).
 */
export interface ShopDailyStock {
  _id?: ObjectId;
  itemId: string;
  stock: number;
  lastRefresh: string;
}

export type CreateShopDailyStockInput = Omit<ShopDailyStock, "_id">;
