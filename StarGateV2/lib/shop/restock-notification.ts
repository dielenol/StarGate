import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";

import { getAllDailyStocks } from "@/lib/db/shop";
import { notifyShopRestock } from "@/lib/discord";

import { isShopOpen, SHOP_CATALOG } from "./catalog";

type ShopRestockNotificationStatus =
  | "sent"
  | "sent-untracked"
  | "skipped-no-stock"
  | "skipped-no-webhook"
  | "skipped-already-sent"
  | "failed";

export interface ShopRestockNotificationResult {
  status: ShopRestockNotificationStatus;
  itemCount: number;
  error?: string;
}

interface ShopRestockNotificationDoc {
  _id: string;
  kind: "daily-shop-restock";
  date: string;
  createdAt: Date;
  claimedAt?: Date;
  claimLeaseUntil?: Date;
  sentAt?: Date;
  itemCount?: number;
  lastError?: string;
  failedAt?: Date;
}

const COLLECTION_NAME = "shop_restock_notifications";
const CLAIM_LEASE_MS = 10 * 60 * 1000;

async function notificationCollection() {
  const db = await getDb();
  return db.collection<ShopRestockNotificationDoc>(COLLECTION_NAME);
}

function getNotificationId(today: string): string {
  return `daily-shop-restock:${today}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function claimNotification(today: string, now: Date): Promise<boolean> {
  const col = await notificationCollection();
  const _id = getNotificationId(today);
  const claimLeaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);

  try {
    const result = await col.updateOne(
      {
        _id,
        sentAt: { $exists: false },
        $or: [
          { claimLeaseUntil: { $exists: false } },
          { claimLeaseUntil: { $lt: now } },
        ],
      },
      {
        $setOnInsert: {
          _id,
          kind: "daily-shop-restock",
          date: today,
          createdAt: now,
        },
        $set: {
          claimedAt: now,
          claimLeaseUntil,
        },
        $unset: {
          failedAt: "",
          lastError: "",
        },
      },
      { upsert: true },
    );

    return result.upsertedCount === 1 || result.modifiedCount === 1;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

async function markNotificationSent(
  today: string,
  now: Date,
  itemCount: number,
): Promise<void> {
  const col = await notificationCollection();
  await col.updateOne(
    { _id: getNotificationId(today) },
    {
      $set: {
        sentAt: now,
        itemCount,
      },
      $unset: {
        claimLeaseUntil: "",
        failedAt: "",
        lastError: "",
      },
    },
  );
}

async function releaseNotificationClaim(
  today: string,
  now: Date,
  error: string,
): Promise<void> {
  const col = await notificationCollection();
  await col.updateOne(
    {
      _id: getNotificationId(today),
      sentAt: { $exists: false },
    },
    {
      $set: {
        failedAt: now,
        lastError: error.slice(0, 1000),
      },
      $unset: {
        claimLeaseUntil: "",
      },
    },
  );
}

async function buildRestockPayload(today: string, now: Date) {
  const stocks = await getAllDailyStocks();
  const stockByItemId = new Map(
    stocks
      .filter((stock) => stock.lastRefresh === today)
      .map((stock) => [stock.itemId, stock.stock]),
  );

  return {
    today,
    isOpen: isShopOpen(now),
    items: SHOP_CATALOG.map((item) => ({
      name: item.name,
      icon: item.icon,
      stock: stockByItemId.get(item.slug) ?? 0,
      price: item.price,
      pageGroup: item.pageGroup,
    })).filter((item) => item.stock > 0),
  };
}

export async function notifyDailyShopRestock(
  today: string,
  now: Date = new Date(),
): Promise<ShopRestockNotificationResult> {
  const payload = await buildRestockPayload(today, now);
  const itemCount = payload.items.length;

  if (itemCount === 0) {
    return { status: "skipped-no-stock", itemCount };
  }

  if (!process.env.DISCORD_WEBHOOK_SHOP_URL) {
    console.warn(
      "[notifyDailyShopRestock] DISCORD_WEBHOOK_SHOP_URL 미설정 — silent skip",
    );
    return { status: "skipped-no-webhook", itemCount };
  }

  const claimed = await claimNotification(today, now);
  if (!claimed) {
    return { status: "skipped-already-sent", itemCount };
  }

  try {
    const sendResult = await notifyShopRestock(payload);
    if (sendResult === "skipped") {
      await releaseNotificationClaim(today, now, "webhook skipped");
      return { status: "skipped-no-webhook", itemCount };
    }
  } catch (error) {
    const message = getErrorMessage(error);
    await releaseNotificationClaim(today, now, message);
    console.warn("[notifyDailyShopRestock] Discord 전송 실패:", error);
    return { status: "failed", itemCount, error: message };
  }

  try {
    await markNotificationSent(today, now, itemCount);
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[notifyDailyShopRestock] sentAt 기록 실패:", error);
    return { status: "sent-untracked", itemCount, error: message };
  }

  return { status: "sent", itemCount };
}
