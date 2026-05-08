/**
 * shop_inventory + shop_daily_stock CRUD
 *
 * tia_bot 의 편의점 도메인.
 * - shop_inventory: 사용자(User) 단위 보유 소모품 (character_inventory 와 분리).
 * - shop_daily_stock: 아이템별 당일 재고. lastRefresh 는 KST YYYY-MM-DD 문자열.
 */

import type {
  ShopDailyStock,
  ShopInventory,
} from "../types/index.js";

import {
  shopDailyStockCol,
  shopInventoryCol,
} from "../collections.js";

/* ── shop_inventory ── */

/**
 * 활성 보유 인벤토리 (quantity > 0).
 * 일반 표시/조회용. 0 quantity 잔여 row 는 제외.
 */
export async function getUserInventory(userId: string): Promise<ShopInventory[]> {
  const col = await shopInventoryCol();
  return col
    .find({ userId, quantity: { $gt: 0 } })
    .sort({ itemId: 1 })
    .toArray();
}

/**
 * 0 quantity 포함 전체 인벤토리 (감사/마이그용).
 * race-aware delete 직전 또는 마이그레이션 검증 등 raw 데이터가 필요할 때만 사용.
 */
export async function getUserInventoryRaw(userId: string): Promise<ShopInventory[]> {
  const col = await shopInventoryCol();
  return col.find({ userId }).sort({ itemId: 1 }).toArray();
}

/**
 * 사용자 인벤토리에 아이템 qty 를 더한다 (upsert + $inc).
 * qty 는 양수.
 */
export async function addInventory(
  userId: string,
  itemId: string,
  qty: number,
): Promise<void> {
  if (qty <= 0) {
    throw new Error(`addInventory: qty must be positive, got ${qty}`);
  }
  const col = await shopInventoryCol();
  await col.updateOne(
    { userId, itemId },
    {
      $inc: { quantity: qty },
      $set: { updatedAt: new Date() },
      $setOnInsert: { userId, itemId },
    },
    { upsert: true },
  );
}

/**
 * 사용자 인벤토리에서 아이템 qty 를 atomic 하게 차감.
 *
 * - quantity >= qty 일 때만 매치하여 race condition 방지.
 * - 보유 부족 시 false 반환 (수정 없음).
 * - 차감 후 quantity 가 0 이 되면 race-aware deleteOne 으로 row 정리.
 */
export async function removeInventory(
  userId: string,
  itemId: string,
  qty: number,
): Promise<boolean> {
  if (qty <= 0) {
    throw new Error(`removeInventory: qty must be positive, got ${qty}`);
  }
  const col = await shopInventoryCol();
  const result = await col.findOneAndUpdate(
    { userId, itemId, quantity: { $gte: qty } },
    {
      $inc: { quantity: -qty },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!result) return false;
  if (result.quantity === 0) {
    // race-aware delete: 다른 호출이 그 사이 +qty 했으면 quantity:0 매치 안 되어 보존됨.
    await col.deleteOne({ _id: result._id, quantity: 0 });
  }
  return true;
}

/* ── shop_daily_stock ── */

/**
 * lastRefresh 가 todayKst 와 다르면 true (재고 리프레시 필요).
 * 문서 미존재 시에도 true.
 */
export async function needsRefresh(
  itemId: string,
  todayKst: string,
): Promise<boolean> {
  const col = await shopDailyStockCol();
  const doc = await col.findOne({ itemId });
  if (!doc) return true;
  return doc.lastRefresh !== todayKst;
}

/**
 * 재고를 todayKst 기준으로 강제 갱신 (upsert).
 */
export async function refreshStock(
  itemId: string,
  stock: number,
  todayKst: string,
): Promise<void> {
  const col = await shopDailyStockCol();
  await col.updateOne(
    { itemId },
    {
      $set: { stock, lastRefresh: todayKst },
      $setOnInsert: { itemId },
    },
    { upsert: true },
  );
}

/**
 * 재고 문서가 없으면 defaultStock 으로 생성 후 반환 (멱등).
 * 이미 있으면 그대로 반환 (lastRefresh 갱신은 refreshStock 책임).
 */
export async function ensureStockEntry(
  itemId: string,
  todayKst: string,
  defaultStock: number,
): Promise<ShopDailyStock> {
  const col = await shopDailyStockCol();
  const existing = await col.findOne({ itemId });
  if (existing) return existing;

  const doc: ShopDailyStock = {
    itemId,
    stock: defaultStock,
    lastRefresh: todayKst,
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function getStock(itemId: string): Promise<ShopDailyStock | null> {
  const col = await shopDailyStockCol();
  return col.findOne({ itemId });
}

/**
 * 재고를 atomic 하게 qty 차감.
 *
 * - stock >= qty 일 때만 매치.
 * - 재고 부족 시 false 반환.
 */
export async function reduceStock(
  itemId: string,
  qty: number,
): Promise<boolean> {
  if (qty <= 0) {
    throw new Error(`reduceStock: qty must be positive, got ${qty}`);
  }
  const col = await shopDailyStockCol();
  const result = await col.updateOne(
    { itemId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
  );
  return result.modifiedCount > 0;
}

export async function getAllDailyStocks(): Promise<ShopDailyStock[]> {
  const col = await shopDailyStockCol();
  return col.find().sort({ itemId: 1 }).toArray();
}
