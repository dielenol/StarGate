import { randomUUID } from "node:crypto";

import { getDb } from "@stargate/shared-db";

import {
  createDiscordWebhookMessage,
  deleteDiscordWebhookMessage,
  type DiscordWebhookPayload,
} from "../outbox/discord-client.js";
import type { DueWorkConsumerPort } from "./port.js";

const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

interface DiscordDesiredState {
  _id: string;
  requestedRevision: number;
  syncedRevision: number;
  desiredPayloads: DiscordWebhookPayload[];
  messageIds?: string[];
  cleanupMessageIds?: string[];
  leaseToken?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  updatedAt: Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DiscordDesiredStateConsumer implements DueWorkConsumerPort {
  constructor(
    readonly name: "shop-restock" | "stock-market-wire",
    private readonly options: {
      collectionName: string;
      stateId: string;
      webhookUrl: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async tick({ signal }: { signal: AbortSignal }) {
    const summary = {
      observedDue: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
    };
    if (signal.aborted) return summary;

    const db = await getDb();
    const col = db.collection<DiscordDesiredState>(
      this.options.collectionName,
    );
    const now = new Date();
    const leaseToken = randomUUID();
    const state = await col.findOneAndUpdate(
      {
        _id: this.options.stateId,
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
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!state) return summary;
    summary.observedDue = 1;
    summary.claimed = 1;

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const newMessageIds: string[] = [];
    let completionAttempted = false;
    try {
      const previousIds = Array.from(
        new Set([
          ...(state.messageIds ?? []),
          ...(state.cleanupMessageIds ?? []),
        ]),
      );
      for (const messageId of previousIds) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          messageId,
          fetchImpl,
        );
      }

      for (const payload of state.desiredPayloads) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        const messageId = await createDiscordWebhookMessage(
          this.options.webhookUrl,
          payload,
          fetchImpl,
        );
        newMessageIds.push(messageId);
        const recorded = await col.updateOne(
          { _id: state._id, leaseToken },
          {
            $set: {
              cleanupMessageIds: newMessageIds,
              updatedAt: new Date(),
            },
          },
        );
        if (recorded.modifiedCount !== 1) {
          throw new Error("Discord message id 기록 전에 lease를 상실했습니다.");
        }
      }

      completionAttempted = true;
      const completed = await col.updateOne(
        { _id: state._id, leaseToken },
        {
          $set: {
            syncedRevision: state.requestedRevision,
            messageIds: newMessageIds,
            updatedAt: new Date(),
          },
          $unset: {
            cleanupMessageIds: "",
            leaseToken: "",
            leaseExpiresAt: "",
            nextAttemptAt: "",
            lastError: "",
          },
        },
      );
      if (completed.modifiedCount !== 1) {
        throw new Error("Discord desired-state 완료 전에 lease를 상실했습니다.");
      }
      summary.delivered = 1;
      return summary;
    } catch (error) {
      let completionUncertain = false;
      if (completionAttempted && newMessageIds.length > 0) {
        try {
          const confirmed = await col.findOne(
            {
              _id: state._id,
              syncedRevision: { $gte: state.requestedRevision },
              messageIds: newMessageIds,
            },
            { projection: { _id: 1 } },
          );
          if (confirmed) {
            summary.delivered = 1;
            return summary;
          }
        } catch {
          completionUncertain = true;
        }
      }
      if (!completionUncertain) {
        for (const messageId of newMessageIds) {
          await deleteDiscordWebhookMessage(
            this.options.webhookUrl,
            messageId,
            fetchImpl,
          ).catch(() => {});
        }
      }
      const failedAt = new Date();
      await col.updateOne(
        { _id: state._id, leaseToken },
        {
          $set: {
            lastError: errorMessage(error).slice(0, 1_000),
            nextAttemptAt: new Date(failedAt.getTime() + RETRY_DELAY_MS),
            ...(newMessageIds.length > 0
              ? { cleanupMessageIds: newMessageIds }
              : {}),
            updatedAt: failedAt,
          },
          $unset: { leaseToken: "", leaseExpiresAt: "" },
        },
      );
      summary.failed = 1;
      return summary;
    }
  }
}
