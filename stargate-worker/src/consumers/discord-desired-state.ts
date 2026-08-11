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
  replacementMessageIds?: string[];
  staleMessageIds?: string[];
  /** 이전 worker가 쓰던 생성 중 message id 필드. */
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
      getDbImpl?: typeof getDb;
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

    const db = await (this.options.getDbImpl ?? getDb)();
    const col = db.collection<DiscordDesiredState>(
      this.options.collectionName,
    );
    const now = new Date();
    const leaseToken = randomUUID();
    const state = await col.findOneAndUpdate(
      {
        _id: this.options.stateId,
        $or: [
          { $expr: { $gt: ["$requestedRevision", "$syncedRevision"] } },
          { "staleMessageIds.0": { $exists: true } },
          { "replacementMessageIds.0": { $exists: true } },
          { "cleanupMessageIds.0": { $exists: true } },
        ],
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
    let activated = false;
    let activationAttempted = false;
    let preexistingReplacementCleanup = false;
    try {
      const activeIds = new Set(state.messageIds ?? []);
      const orphanReplacementIds = Array.from(
        new Set([
          ...(state.replacementMessageIds ?? []),
          ...(state.cleanupMessageIds ?? []),
        ].filter((messageId) => !activeIds.has(messageId))),
      );
      preexistingReplacementCleanup = orphanReplacementIds.length > 0;
      for (const messageId of orphanReplacementIds) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          messageId,
          fetchImpl,
        );
      }
      if (orphanReplacementIds.length > 0) {
        const cleared = await col.updateOne(
          { _id: state._id, leaseToken },
          {
            $unset: {
              replacementMessageIds: "",
              cleanupMessageIds: "",
            },
            $set: { updatedAt: new Date() },
          },
        );
        if (cleared.modifiedCount !== 1) {
          throw new Error("교체 중 Discord message 정리 전에 lease를 상실했습니다.");
        }
        preexistingReplacementCleanup = false;
      }

      const staleIds = Array.from(new Set(state.staleMessageIds ?? []));
      for (const messageId of staleIds) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          messageId,
          fetchImpl,
        );
        const pulled = await col.updateOne(
          { _id: state._id, leaseToken },
          {
            $pull: { staleMessageIds: messageId },
            $set: { updatedAt: new Date() },
          },
        );
        if (pulled.modifiedCount !== 1) {
          throw new Error("이전 Discord message 정리 전에 lease를 상실했습니다.");
        }
      }

      if (state.requestedRevision <= state.syncedRevision) {
        const completedCleanup = await col.updateOne(
          { _id: state._id, leaseToken },
          {
            $unset: {
              staleMessageIds: "",
              replacementMessageIds: "",
              cleanupMessageIds: "",
              leaseToken: "",
              leaseExpiresAt: "",
              nextAttemptAt: "",
              lastError: "",
            },
            $set: { updatedAt: new Date() },
          },
        );
        if (completedCleanup.modifiedCount !== 1) {
          throw new Error("Discord desired-state 정리 완료 전에 lease를 상실했습니다.");
        }
        return summary;
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
              replacementMessageIds: newMessageIds,
              updatedAt: new Date(),
            },
          },
        );
        if (recorded.modifiedCount !== 1) {
          throw new Error("Discord message id 기록 전에 lease를 상실했습니다.");
        }
      }

      activationAttempted = true;
      const previousIds = Array.from(new Set(state.messageIds ?? []));
      const activatedResult = await col.updateOne(
        { _id: state._id, leaseToken },
        {
          $set: {
            syncedRevision: state.requestedRevision,
            messageIds: newMessageIds,
            staleMessageIds: previousIds,
            updatedAt: new Date(),
          },
          $unset: {
            replacementMessageIds: "",
            cleanupMessageIds: "",
          },
        },
      );
      if (activatedResult.modifiedCount !== 1) {
        throw new Error("Discord desired-state 활성화 전에 lease를 상실했습니다.");
      }
      activated = true;

      for (const messageId of previousIds) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          messageId,
          fetchImpl,
        );
        const pulled = await col.updateOne(
          { _id: state._id, leaseToken },
          {
            $pull: { staleMessageIds: messageId },
            $set: { updatedAt: new Date() },
          },
        );
        if (pulled.modifiedCount !== 1) {
          throw new Error("이전 Discord message 정리 전에 lease를 상실했습니다.");
        }
      }
      const completed = await col.updateOne(
        { _id: state._id, leaseToken },
        {
          $set: { updatedAt: new Date() },
          $unset: {
            staleMessageIds: "",
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
      if (activationAttempted && !activated && newMessageIds.length > 0) {
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
            activated = true;
          }
        } catch {}
      }
      // 활성화 write의 결과가 불명확하면 새 메시지를 지우지 않는다. 실제 commit된
      // 경우 DB가 새 ID를 가리키므로 삭제가 채널 공백을 만들 수 있다. 다음 lease가
      // active/replacement ID를 대조해 안전하게 수렴한다.
      let preserveReplacement = activationAttempted && !activated;
      if (!activated && !preserveReplacement) {
        for (const messageId of newMessageIds) {
          await deleteDiscordWebhookMessage(
            this.options.webhookUrl,
            messageId,
            fetchImpl,
          ).catch(() => {
            preserveReplacement = true;
          });
        }
      }
      const failedAt = new Date();
      await col.updateOne(
        { _id: state._id, leaseToken },
        {
          $set: {
            lastError: errorMessage(error).slice(0, 1_000),
            nextAttemptAt: new Date(failedAt.getTime() + RETRY_DELAY_MS),
            ...(!activated && preserveReplacement && newMessageIds.length > 0
              ? { replacementMessageIds: newMessageIds }
              : {}),
            updatedAt: failedAt,
          },
          $unset: {
            leaseToken: "",
            leaseExpiresAt: "",
            ...(!activated &&
            !preserveReplacement &&
            !preexistingReplacementCleanup
              ? { replacementMessageIds: "", cleanupMessageIds: "" }
              : {}),
          },
        },
      );
      summary.failed = 1;
      return summary;
    }
  }
}
