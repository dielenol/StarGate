import {
  MongoServerError,
  type Collection,
  type Filter,
  type UpdateFilter,
} from "mongodb";

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
  desiredFormatRevision?: string;
  desiredPayloads: DiscordPayload[];
  messageIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ScheduledStockMarketWireSyncArgs {
  date: string;
  sourceRevision?: string;
  formatRevision: string;
  payloads: DiscordPayload[];
}

type ScheduledStockMarketWireCollection = Pick<
  Collection<ScheduledStockMarketWireState>,
  "updateOne"
>;

async function scheduledStockMarketWireCol(): Promise<
  Collection<ScheduledStockMarketWireState>
> {
  const db = await getDb();
  return db.collection<ScheduledStockMarketWireState>(COLLECTION_NAME);
}

function revisionMismatchFilter(
  args: ScheduledStockMarketWireSyncArgs,
): Filter<ScheduledStockMarketWireState> {
  return {
    _id: SCHEDULED_WIRE_ID,
    $or: [
      { desiredDate: { $ne: args.date } },
      args.sourceRevision === undefined
        ? { desiredSourceRevision: { $exists: true } }
        : { desiredSourceRevision: { $ne: args.sourceRevision } },
      { desiredFormatRevision: { $ne: args.formatRevision } },
    ],
  };
}

function desiredStateUpdate(
  args: ScheduledStockMarketWireSyncArgs,
  now: Date,
): UpdateFilter<ScheduledStockMarketWireState> {
  return {
    $inc: { requestedRevision: 1 },
    $set: {
      desiredDate: args.date,
      ...(args.sourceRevision !== undefined
        ? { desiredSourceRevision: args.sourceRevision }
        : {}),
      desiredFormatRevision: args.formatRevision,
      desiredPayloads: args.payloads,
      updatedAt: now,
    },
    $unset: {
      ...(args.sourceRevision === undefined
        ? { desiredSourceRevision: "" }
        : {}),
      lastError: "",
      nextAttemptAt: "",
    },
  };
}

export async function requestScheduledStockMarketWireSync(
  args: ScheduledStockMarketWireSyncArgs,
  dependencies: { collection?: ScheduledStockMarketWireCollection } = {},
): Promise<"requested" | "current"> {
  if (args.payloads.length === 0) return "current";
  const now = new Date();
  const col = dependencies.collection ?? (await scheduledStockMarketWireCol());
  const updateIfChanged = () =>
    col.updateOne(revisionMismatchFilter(args), desiredStateUpdate(args, now));
  const updated = await updateIfChanged();
  if (updated.matchedCount === 1) return "requested";

  try {
    const inserted = await col.updateOne(
      { _id: SCHEDULED_WIRE_ID },
      {
        $setOnInsert: {
          requestedRevision: 1,
          syncedRevision: 0,
          desiredDate: args.date,
          ...(args.sourceRevision !== undefined
            ? { desiredSourceRevision: args.sourceRevision }
            : {}),
          desiredFormatRevision: args.formatRevision,
          desiredPayloads: args.payloads,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    if (inserted.upsertedCount === 1) return "requested";
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }
  }

  const raced = await updateIfChanged();
  return raced.matchedCount === 1 ? "requested" : "current";
}
