import { randomUUID } from "node:crypto";

import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";

import { getAllDailyStocks } from "@/lib/db/shop";
import {
  buildShopRestockDiscordPayload,
  createDailyShopRestockDiscordMessage,
  deleteDailyShopRestockDiscordMessage,
  type DiscordPayload,
  type ShopRestockWebhookPayload,
} from "@/lib/discord";
import {
  drainDiscordMessageBatchSync,
  type DiscordMessageBatchSyncResult,
} from "@/lib/discord/message-batch-sync";
import { cleanupDailyShopRestockHistory } from "@/lib/notifications/discord-history-cleanup";

import { SHOP_CATALOG } from "./catalog";
import { getShopOpenState } from "./open-state";

type ShopRestockNotificationStatus =
  | "sent"
  | "queued"
  | "skipped-no-stock"
  | "skipped-incomplete"
  | "skipped-no-webhook"
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
  messageIds?: string[];
  cleanupMessageIds?: string[];
  leaseToken?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION_NAME = "shop_restock_notifications";
const STATE_ID = "daily-shop-restock";
const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

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
  payload: DiscordPayload;
}): Promise<void> {
  const now = new Date();
  await (await notificationCollection()).updateOne(
    { _id: STATE_ID },
    {
      $inc: { requestedRevision: 1 },
      $setOnInsert: { syncedRevision: 0, createdAt: now },
      $set: {
        desiredDate: args.date,
        desiredPayloads: [args.payload],
        updatedAt: now,
      },
      $unset: { lastError: "", nextAttemptAt: "" },
    },
    { upsert: true },
  );
}

async function acquireNotificationLease(args: {
  leaseToken: string;
  now?: Date;
}): Promise<ShopRestockNotificationState | null> {
  const now = args.now ?? new Date();
  return (await notificationCollection()).findOneAndUpdate(
    {
      _id: STATE_ID,
      $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
      $and: [
        {
          $or: [
            { leaseToken: { $exists: false } },
            { leaseExpiresAt: { $exists: false } },
            { leaseExpiresAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        leaseToken: args.leaseToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}

async function recordInflightMessages(args: {
  leaseToken: string;
  messageIds: string[];
}): Promise<boolean> {
  const result = await (await notificationCollection()).updateOne(
    { _id: STATE_ID, leaseToken: args.leaseToken },
    {
      $set: {
        cleanupMessageIds: args.messageIds,
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount === 1;
}

async function completeNotificationSync(args: {
  leaseToken: string;
  syncedRevision: number;
  messageIds: string[];
}): Promise<boolean> {
  const result = await (await notificationCollection()).updateOne(
    { _id: STATE_ID, leaseToken: args.leaseToken },
    {
      $set: {
        syncedRevision: args.syncedRevision,
        messageIds: args.messageIds,
        updatedAt: new Date(),
      },
      $unset: {
        leaseToken: "",
        leaseExpiresAt: "",
        cleanupMessageIds: "",
        lastError: "",
        nextAttemptAt: "",
      },
    },
  );
  return result.modifiedCount === 1;
}

async function failNotificationSync(args: {
  leaseToken: string;
  error: string;
  cleanupMessageIds: string[];
}): Promise<void> {
  const now = new Date();
  const cleanupState =
    args.cleanupMessageIds.length > 0
      ? { cleanupMessageIds: args.cleanupMessageIds }
      : {};
  await (await notificationCollection()).updateOne(
    { _id: STATE_ID, leaseToken: args.leaseToken },
    {
      $set: {
        lastError: args.error.slice(0, 1000),
        nextAttemptAt: new Date(now.getTime() + RETRY_DELAY_MS),
        updatedAt: now,
        ...cleanupState,
      },
      $unset: { leaseToken: "", leaseExpiresAt: "" },
    },
  );
}

async function isNotificationSyncComplete(args: {
  syncedRevision: number;
  messageIds: string[];
}): Promise<boolean> {
  const state = await (await notificationCollection()).findOne(
    {
      _id: STATE_ID,
      syncedRevision: { $gte: args.syncedRevision },
      messageIds: args.messageIds,
    },
    { projection: { _id: 1 } },
  );
  return Boolean(state);
}

async function buildRestockPayload(
  today: string,
  now: Date,
): Promise<{ payload: ShopRestockWebhookPayload; complete: boolean }> {
  const openState = await getShopOpenState(now);
  const stocks = await getAllDailyStocks();
  const stockByItemId = new Map(
    stocks
      .filter((stock) => stock.lastRefresh === today)
      .map((stock) => [stock.itemId, stock.stock]),
  );

  return {
    complete: SHOP_CATALOG.every((item) => stockByItemId.has(item.slug)),
    payload: {
      today,
      isOpen: openState.isOpen,
      openMode: openState.mode,
      scheduledOpen: openState.scheduledOpen,
      items: SHOP_CATALOG.map((item) => ({
        name: item.name,
        icon: item.icon,
        stock: stockByItemId.get(item.slug) ?? 0,
        price: item.price,
        pageGroup: item.pageGroup,
      })).filter((item) => item.stock > 0),
    },
  };
}

export async function syncDailyShopRestockDiscordMessage(): Promise<DiscordMessageBatchSyncResult> {
  return drainDiscordMessageBatchSync({
    logPrefix: "shop-restock-discord",
    newLeaseToken: randomUUID,
    acquire: async (leaseToken) => {
      const state = await acquireNotificationLease({ leaseToken });
      return state
        ? {
            requestedRevision: state.requestedRevision,
            messageIds: Array.from(
              new Set([
                ...(state.messageIds ?? []),
                ...(state.cleanupMessageIds ?? []),
              ]),
            ),
            desiredPayloads: state.desiredPayloads,
            leaseToken,
          }
        : null;
    },
    deleteMessage: deleteDailyShopRestockDiscordMessage,
    createMessage: createDailyShopRestockDiscordMessage,
    recordInflight: recordInflightMessages,
    complete: completeNotificationSync,
    confirm: isNotificationSyncComplete,
    fail: failNotificationSync,
    warn: (message, error) => console.warn(message, error),
  });
}

export async function recoverDailyShopRestockDiscordMessage(
  today: string,
  now: Date = new Date(),
): Promise<{
  status:
    | "requested"
    | "current"
    | "pending"
    | "incomplete"
    | "no-stock"
    | "skipped-no-webhook";
  itemCount: number;
}> {
  const { payload, complete } = await buildRestockPayload(today, now);
  const itemCount = payload.items.length;
  if (!complete) return { status: "incomplete", itemCount };
  if (itemCount === 0) return { status: "no-stock", itemCount };
  if (!process.env.DISCORD_WEBHOOK_SHOP_URL) {
    return { status: "skipped-no-webhook", itemCount };
  }

  const state = await findNotificationState();
  if (state?.desiredDate === today) {
    return {
      status:
        state.requestedRevision > state.syncedRevision ? "pending" : "current",
      itemCount,
    };
  }

  const discordPayload = buildShopRestockDiscordPayload(payload);
  if (!discordPayload) return { status: "no-stock", itemCount: 0 };
  await requestNotificationSync({ date: today, payload: discordPayload });
  return { status: "requested", itemCount };
}

export async function notifyDailyShopRestock(
  today: string,
  now: Date = new Date(),
): Promise<ShopRestockNotificationResult> {
  try {
    const recovery = await recoverDailyShopRestockDiscordMessage(today, now);
    if (recovery.status === "no-stock") {
      return { status: "skipped-no-stock", itemCount: recovery.itemCount };
    }
    if (recovery.status === "incomplete") {
      return {
        status: "skipped-incomplete",
        itemCount: recovery.itemCount,
      };
    }
    if (recovery.status === "skipped-no-webhook") {
      console.warn(
        "[notifyDailyShopRestock] DISCORD_WEBHOOK_SHOP_URL 미설정 — silent skip",
      );
      return {
        status: "skipped-no-webhook",
        itemCount: recovery.itemCount,
      };
    }

    const result = await syncDailyShopRestockDiscordMessage();
    if (
      result === "synced" ||
      (result === "idle" && recovery.status === "current")
    ) {
      const state = await findNotificationState();
      if (
        !state?.messageIds?.length ||
        state.requestedRevision > state.syncedRevision
      ) {
        return {
          status: "failed",
          itemCount: recovery.itemCount,
          error: "Discord 편의점 입고 공지의 현재 message id를 확인할 수 없습니다.",
        };
      }
      const cleanup = await cleanupDailyShopRestockHistory(state.messageIds);
      if (cleanup.deletedCount > 0) {
        console.info(
          `[shop-restock-discord] 과거 입고 공지 ${cleanup.deletedCount}건 삭제`,
        );
      }
    }
    if (result === "synced") {
      return { status: "sent", itemCount: recovery.itemCount };
    }
    if (result === "idle") {
      return {
        status:
          recovery.status === "current" ? "skipped-current" : "queued",
        itemCount: recovery.itemCount,
      };
    }
    return {
      status: "failed",
      itemCount: recovery.itemCount,
      error: `Discord 편의점 입고 공지 동기화 실패 (${result})`,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn("[notifyDailyShopRestock] 공지 상태 요청 실패:", error);
    return { status: "failed", itemCount: 0, error: message };
  }
}
