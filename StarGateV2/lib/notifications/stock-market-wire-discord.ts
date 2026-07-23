import { randomUUID } from "node:crypto";

import {
  acquireScheduledStockMarketWireLease,
  completeScheduledStockMarketWireSync,
  failScheduledStockMarketWireSync,
  isScheduledStockMarketWireSyncComplete,
  recordScheduledStockMarketWireInflightMessages,
} from "@/lib/db/stock-market-wire";
import {
  createScheduledStockMarketWireMessage,
  deleteScheduledStockMarketWireMessage,
} from "@/lib/stocks/market-wire";
import {
  drainDiscordMessageBatchSync,
  type DiscordMessageBatchSyncResult,
} from "@/lib/discord/message-batch-sync";

export async function syncScheduledStockMarketWireMessages(): Promise<DiscordMessageBatchSyncResult> {
  return drainDiscordMessageBatchSync({
    logPrefix: "stock-market-wire",
    newLeaseToken: randomUUID,
    acquire: async (leaseToken) => {
      const state = await acquireScheduledStockMarketWireLease({ leaseToken });
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
    deleteMessage: deleteScheduledStockMarketWireMessage,
    createMessage: createScheduledStockMarketWireMessage,
    recordInflight: recordScheduledStockMarketWireInflightMessages,
    complete: completeScheduledStockMarketWireSync,
    confirm: isScheduledStockMarketWireSyncComplete,
    fail: failScheduledStockMarketWireSync,
    warn: (message, error) => console.warn(message, error),
  });
}
