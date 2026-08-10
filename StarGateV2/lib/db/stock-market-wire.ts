import type { Collection } from "mongodb";

import "./init";

import { getDb } from "@stargate/shared-db";

import type { DiscordPayload } from "@/lib/stocks/market-wire";

const COLLECTION_NAME = "stock_discord_market_wires";
const SCHEDULED_WIRE_ID = "scheduled";

export interface ScheduledStockMarketWireState {
  _id: typeof SCHEDULED_WIRE_ID;
  requestedRevision: number;
  syncedRevision: number;
  desiredDate: string;
  desiredSourceRevision?: string;
  desiredPayloads: DiscordPayload[];
  messageIds?: string[];
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
