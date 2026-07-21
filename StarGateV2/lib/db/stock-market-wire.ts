import type { Collection } from "mongodb";

import "./init";

import { getDb } from "@stargate/shared-db";

import type { DiscordPayload } from "@/lib/stocks/market-wire";

const COLLECTION_NAME = "stock_discord_market_wires";
const SCHEDULED_WIRE_ID = "scheduled";
const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

export interface ScheduledStockMarketWireState {
  _id: typeof SCHEDULED_WIRE_ID;
  requestedRevision: number;
  syncedRevision: number;
  desiredDate: string;
  desiredSourceRevision?: string;
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

async function scheduledStockMarketWireCol(): Promise<
  Collection<ScheduledStockMarketWireState>
> {
  const db = await getDb();
  return db.collection<ScheduledStockMarketWireState>(COLLECTION_NAME);
}

export async function requestScheduledStockMarketWireSync(args: {
  date: string;
  sourceRevision?: string;
  payloads: DiscordPayload[];
}): Promise<void> {
  if (args.payloads.length === 0) return;
  const now = new Date();
  const col = await scheduledStockMarketWireCol();
  await col.updateOne(
    { _id: SCHEDULED_WIRE_ID },
    {
      $inc: { requestedRevision: 1 },
      $setOnInsert: {
        syncedRevision: 0,
        createdAt: now,
      },
      $set: {
        desiredDate: args.date,
        ...(args.sourceRevision
          ? { desiredSourceRevision: args.sourceRevision }
          : {}),
        desiredPayloads: args.payloads,
        updatedAt: now,
      },
      $unset: { lastError: "", nextAttemptAt: "" },
    },
    { upsert: true },
  );
}

export async function acquireScheduledStockMarketWireLease(args: {
  leaseToken: string;
  now?: Date;
}): Promise<ScheduledStockMarketWireState | null> {
  const now = args.now ?? new Date();
  const col = await scheduledStockMarketWireCol();
  return col.findOneAndUpdate(
    {
      _id: SCHEDULED_WIRE_ID,
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

export async function completeScheduledStockMarketWireSync(args: {
  leaseToken: string;
  syncedRevision: number;
  messageIds: string[];
}): Promise<boolean> {
  const col = await scheduledStockMarketWireCol();
  const result = await col.updateOne(
    {
      _id: SCHEDULED_WIRE_ID,
      leaseToken: args.leaseToken,
    },
    {
      $set: {
        syncedRevision: args.syncedRevision,
        messageIds: args.messageIds,
        updatedAt: new Date(),
      },
      $unset: {
        leaseToken: "",
        leaseExpiresAt: "",
        lastError: "",
        nextAttemptAt: "",
        cleanupMessageIds: "",
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function recordScheduledStockMarketWireInflightMessages(args: {
  leaseToken: string;
  messageIds: string[];
}): Promise<boolean> {
  const col = await scheduledStockMarketWireCol();
  const result = await col.updateOne(
    {
      _id: SCHEDULED_WIRE_ID,
      leaseToken: args.leaseToken,
    },
    {
      $set: {
        cleanupMessageIds: args.messageIds,
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function failScheduledStockMarketWireSync(args: {
  leaseToken: string;
  error: string;
  cleanupMessageIds: string[];
}): Promise<void> {
  const now = new Date();
  const col = await scheduledStockMarketWireCol();
  const cleanupState =
    args.cleanupMessageIds.length > 0
      ? { cleanupMessageIds: args.cleanupMessageIds }
      : {};
  await col.updateOne(
    {
      _id: SCHEDULED_WIRE_ID,
      leaseToken: args.leaseToken,
    },
    {
      $set: {
        lastError: args.error.slice(0, 1000),
        nextAttemptAt: new Date(now.getTime() + RETRY_DELAY_MS),
        updatedAt: now,
        ...cleanupState,
      },
      $unset: {
        leaseToken: "",
        leaseExpiresAt: "",
      },
    },
  );
}

export async function isScheduledStockMarketWireSyncComplete(args: {
  syncedRevision: number;
  messageIds: string[];
}): Promise<boolean> {
  const col = await scheduledStockMarketWireCol();
  const state = await col.findOne(
    {
      _id: SCHEDULED_WIRE_ID,
      syncedRevision: { $gte: args.syncedRevision },
      messageIds: args.messageIds,
    },
    { projection: { _id: 1 } },
  );
  return Boolean(state);
}

export async function findScheduledStockMarketWireState(): Promise<ScheduledStockMarketWireState | null> {
  const col = await scheduledStockMarketWireCol();
  return col.findOne({ _id: SCHEDULED_WIRE_ID });
}
