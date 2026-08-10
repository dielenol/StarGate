import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";

import { getAllDailyStocks } from "@/lib/db/shop";
import {
  buildShopRestockDiscordPayloads,
  type DiscordPayload,
  type ShopRestockWebhookPayload,
} from "@/lib/discord";

import { getShopOpenState } from "./open-state";
import { loadRuntimeShopCatalog } from "./runtime-catalog";

type ShopRestockNotificationStatus =
  | "queued"
  | "skipped-no-stock"
  | "skipped-incomplete"
  | "skipped-current"
  | "failed";

export interface ShopRestockNotificationResult {
  status: ShopRestockNotificationStatus;
  itemCount: number;
  error?: string;
}

interface ShopRestockNotificationState {
  _id: "daily-shop-restock";
  requestedRevision: number;
  syncedRevision: number;
  desiredDate: string;
  desiredPayloads: DiscordPayload[];
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "shop_restock_notifications";
const STATE_ID = "daily-shop-restock";

async function notificationCollection() {
  const db = await getDb();
  return db.collection<ShopRestockNotificationState>(COLLECTION_NAME);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function findNotificationState(): Promise<ShopRestockNotificationState | null> {
  return (await notificationCollection()).findOne({ _id: STATE_ID });
}

async function requestNotificationSync(args: {
  date: string;
  payloads: DiscordPayload[];
}): Promise<void> {
  const now = new Date();
  await (await notificationCollection()).updateOne(
    { _id: STATE_ID },
    {
      $inc: { requestedRevision: 1 },
      $setOnInsert: { syncedRevision: 0, createdAt: now },
      $set: {
        desiredDate: args.date,
        desiredPayloads: args.payloads,
        updatedAt: now,
      },
      $unset: { lastError: "", nextAttemptAt: "" },
    },
    { upsert: true },
  );
}

async function buildRestockPayload(
  today: string,
  now: Date,
): Promise<{ payload: ShopRestockWebhookPayload; complete: boolean }> {
  const [catalog, openState, stocks] = await Promise.all([
    loadRuntimeShopCatalog(),
    getShopOpenState(now),
    getAllDailyStocks(),
  ]);
  const stockByItemId = new Map(
    stocks
      .filter((stock) => stock.lastRefresh === today)
      .map((stock) => [stock.itemId, stock.stock]),
  );

  return {
    complete: catalog.every((item) => stockByItemId.has(item.slug)),
    payload: {
      today,
      isOpen: openState.isOpen,
      openMode: openState.mode,
      scheduledOpen: openState.scheduledOpen,
      items: catalog.map((item) => ({
        name: item.name,
        icon: item.icon,
        stock: stockByItemId.get(item.slug) ?? 0,
        price: item.price,
        pageGroup: item.pageGroup,
      })).filter((item) => item.stock > 0),
    },
  };
}

export async function recoverDailyShopRestockDesiredState(
  today: string,
  now: Date = new Date(),
): Promise<{
  status:
    | "requested"
    | "current"
    | "pending"
    | "incomplete"
    | "no-stock";
  itemCount: number;
}> {
  const { payload, complete } = await buildRestockPayload(today, now);
  const itemCount = payload.items.length;
  if (!complete) return { status: "incomplete", itemCount };
  if (itemCount === 0) return { status: "no-stock", itemCount };
  const state = await findNotificationState();
  if (state?.desiredDate === today) {
    return {
      status:
        state.requestedRevision > state.syncedRevision ? "pending" : "current",
      itemCount,
    };
  }

  const discordPayloads = buildShopRestockDiscordPayloads(payload);
  if (discordPayloads.length === 0) {
    return { status: "no-stock", itemCount: 0 };
  }
  await requestNotificationSync({ date: today, payloads: discordPayloads });
  return { status: "requested", itemCount };
}

export async function notifyDailyShopRestock(
  today: string,
  now: Date = new Date(),
): Promise<ShopRestockNotificationResult> {
  try {
    const recovery = await recoverDailyShopRestockDesiredState(today, now);
    if (recovery.status === "no-stock") {
      return { status: "skipped-no-stock", itemCount: recovery.itemCount };
    }
    if (recovery.status === "incomplete") {
      return {
        status: "skipped-incomplete",
        itemCount: recovery.itemCount,
      };
    }
    return {
      status: recovery.status === "current" ? "skipped-current" : "queued",
      itemCount: recovery.itemCount,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[notifyDailyShopRestock] 공지 상태 요청 실패:", error);
    return { status: "failed", itemCount: 0, error: message };
  }
}
