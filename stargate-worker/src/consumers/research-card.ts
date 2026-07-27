import { randomUUID } from "node:crypto";

import {
  getEquipmentResearchNode,
} from "@stargate/core/domain/equipment-research";
import {
  buildResearchDiscordCardPayload,
  type ResearchDiscordContributionLike,
} from "@stargate/core/domain/research-discord-card";
import { getDb } from "@stargate/shared-db";

import {
  createDiscordWebhookMessage,
  deleteDiscordWebhookMessage,
} from "../outbox/discord-client.js";
import type { DueWorkConsumerPort } from "./port.js";

const LEASE_MS = 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

interface ResearchCardState {
  _id: string;
  requestedRevision: number;
  syncedRevision: number;
  messageId?: string;
  cleanupMessageId?: string;
  leaseToken?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  updatedAt: Date;
}

interface ResearchProject {
  key: string;
  scope: "team" | "personal";
  cost: number;
  status: "in_progress" | "applying" | "applied";
  completedAt: Date;
  appliedAt?: Date;
  createdAt: Date;
}

interface ResearchFundingPool {
  key: string;
  targetCost: number;
  fundedAmount: number;
  status: "funding" | "started" | "cancelled";
}

function siteBaseUrl(env: NodeJS.ProcessEnv): string {
  const value =
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    env.SITE_BASE_URL?.trim() ||
    "https://www.ordonet.co.kr";
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SITE_BASE_URL은 http(s) URL이어야 합니다.");
  }
  return url.toString().replace(/\/+$/, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ResearchCardConsumer implements DueWorkConsumerPort {
  readonly name = "research-card";

  constructor(
    private readonly options: {
      webhookUrl: string;
      avatarUrl?: string;
      siteBaseUrl?: string;
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
    const cards = db.collection<ResearchCardState>(
      "research_discord_cards",
    );
    const now = new Date();
    const leaseToken = randomUUID();
    const card = await cards.findOneAndUpdate(
      {
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
      { sort: { updatedAt: 1 }, returnDocument: "after" },
    );
    if (!card) return summary;
    summary.observedDue = 1;
    summary.claimed = 1;

    const fetchImpl = this.options.fetchImpl ?? fetch;
    let newMessageId: string | null = null;
    let completionAttempted = false;
    try {
      const [pool, project, contributions] = await Promise.all([
        db
          .collection<ResearchFundingPool>(
            "research_team_funding_pools",
          )
          .findOne({ key: card._id }),
        db
          .collection<ResearchProject>("research_projects")
          .find({ key: card._id, scope: "team" })
          .sort({ createdAt: -1 })
          .limit(1)
          .next(),
        db
          .collection<ResearchDiscordContributionLike>(
            "research_contributions",
          )
          .find({ projectKey: card._id, scope: "team" })
          .sort({ createdAt: 1 })
          .toArray(),
      ]);
      if (!pool && !project) {
        throw new Error(`팀 연구 현황을 찾을 수 없습니다: ${card._id}`);
      }
      const previousIds = Array.from(
        new Set(
          [card.messageId, card.cleanupMessageId].filter(
            (value): value is string => Boolean(value),
          ),
        ),
      );
      for (const messageId of previousIds) {
        if (signal.aborted) throw new Error("worker shutdown requested");
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          messageId,
          fetchImpl,
        );
      }

      const node = getEquipmentResearchNode(card._id);
      const payload = buildResearchDiscordCardPayload(
        {
          projectKey: card._id,
          projectName: node?.name ?? card._id,
          targetCost: pool?.targetCost ?? project!.cost,
          fundedAmount: pool?.fundedAmount ?? project!.cost,
          fundingStatus: pool?.status ?? "started",
          ...(project
            ? {
                project: {
                  status: project.status,
                  completedAt: project.completedAt,
                  ...(project.appliedAt
                    ? { appliedAt: project.appliedAt }
                    : {}),
                },
              }
            : {}),
          contributions,
          updatedAt: now,
          labUrl: `${this.options.siteBaseUrl ?? siteBaseUrl(process.env)}/erp/equipment-shop/lab`,
        },
        this.options.avatarUrl,
      );
      newMessageId = await createDiscordWebhookMessage(
        this.options.webhookUrl,
        payload,
        fetchImpl,
      );
      const recorded = await cards.updateOne(
        { _id: card._id, leaseToken },
        {
          $set: {
            cleanupMessageId: newMessageId,
            updatedAt: new Date(),
          },
        },
      );
      if (recorded.modifiedCount !== 1) {
        throw new Error("연구 카드 message id 기록 전에 lease를 상실했습니다.");
      }

      completionAttempted = true;
      const completed = await cards.updateOne(
        { _id: card._id, leaseToken },
        {
          $set: {
            syncedRevision: card.requestedRevision,
            messageId: newMessageId,
            updatedAt: new Date(),
          },
          $unset: {
            cleanupMessageId: "",
            leaseToken: "",
            leaseExpiresAt: "",
            nextAttemptAt: "",
            lastError: "",
          },
        },
      );
      if (completed.modifiedCount !== 1) {
        throw new Error("연구 카드 완료 전에 lease를 상실했습니다.");
      }
      summary.delivered = 1;
      return summary;
    } catch (error) {
      let completionUncertain = false;
      if (completionAttempted && newMessageId) {
        try {
          const confirmed = await cards.findOne(
            {
              _id: card._id,
              syncedRevision: { $gte: card.requestedRevision },
              messageId: newMessageId,
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
      if (newMessageId && !completionUncertain) {
        await deleteDiscordWebhookMessage(
          this.options.webhookUrl,
          newMessageId,
          fetchImpl,
        ).catch(() => {});
      }
      const failedAt = new Date();
      await cards.updateOne(
        { _id: card._id, leaseToken },
        {
          $set: {
            lastError: errorMessage(error).slice(0, 1_000),
            nextAttemptAt: new Date(failedAt.getTime() + RETRY_DELAY_MS),
            ...(newMessageId ? { cleanupMessageId: newMessageId } : {}),
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
