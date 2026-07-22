import { randomUUID } from "node:crypto";

import {
  acquireScheduledStockMarketWireLease,
  completeScheduledStockMarketWireSync,
  failScheduledStockMarketWireSync,
  findScheduledStockMarketWireState,
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
import { cleanupScheduledStockMarketWireHistory } from "@/lib/notifications/discord-history-cleanup";

export async function syncScheduledStockMarketWireMessages(): Promise<DiscordMessageBatchSyncResult> {
  const result = await drainDiscordMessageBatchSync({
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
  if (result !== "synced" && result !== "idle") return result;

  const state = await findScheduledStockMarketWireState();
  if (
    !state?.messageIds?.length ||
    state.requestedRevision > state.syncedRevision
  ) {
    return result;
  }
  const cleanup = await cleanupScheduledStockMarketWireHistory(
    state.messageIds,
  );
  if (cleanup.deletedCount > 0) {
    console.info(
      `[stock-market-wire] 과거 정기 공시 ${cleanup.deletedCount}건 삭제`,
    );
  }
  return result;
}
