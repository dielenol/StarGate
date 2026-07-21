import { randomUUID } from "node:crypto";

import {
  acquireEquipmentResearchDiscordCardLease,
  completeEquipmentResearchDiscordCardSync,
  failEquipmentResearchDiscordCardSync,
  findEquipmentResearchProjectByKey,
  findTeamFundingPoolByKey,
  isEquipmentResearchDiscordCardSyncComplete,
  listEquipmentResearchContributionsByProjectKey,
} from "@/lib/db/equipment-research";
import {
  createEquipmentResearchDiscordCard,
  deleteEquipmentResearchDiscordCard,
} from "@/lib/discord";
import {
  buildResearchDiscordCardPayload,
  type ResearchDiscordPayload,
} from "@/lib/equipment-shop/research-discord-card";
import { drainResearchDiscordCardSync } from "@/lib/equipment-shop/research-discord-sync";
import { getEquipmentResearchNode } from "@/lib/equipment-shop/research";

function getSiteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.ordonet.co.kr").replace(
    /\/+$/,
    "",
  );
}

export async function buildCurrentResearchDiscordPayload(
  projectKey: string,
): Promise<ResearchDiscordPayload> {
  const [pool, project, contributions] = await Promise.all([
    findTeamFundingPoolByKey(projectKey),
    findEquipmentResearchProjectByKey({ key: projectKey, scope: "team" }),
    listEquipmentResearchContributionsByProjectKey(projectKey),
  ]);
  if (!pool && !project) {
    throw new Error(`팀 연구 현황을 찾을 수 없습니다: ${projectKey}`);
  }
  const node = getEquipmentResearchNode(projectKey);
  const now = new Date();
  return buildResearchDiscordCardPayload(
    {
      projectKey,
      projectName: node?.name ?? projectKey,
      targetCost: pool?.targetCost ?? project!.cost,
      fundedAmount: pool?.fundedAmount ?? project!.cost,
      fundingStatus: pool?.status ?? "started",
      ...(project
        ? {
            project: {
              status: project.status,
              completedAt: project.completedAt,
              ...(project.appliedAt ? { appliedAt: project.appliedAt } : {}),
            },
          }
        : {}),
      contributions,
      updatedAt: now,
      labUrl: `${getSiteBaseUrl()}/erp/equipment-shop/lab`,
    },
    process.env.DISCORD_WEBHOOK_RESEARCH_AVATAR_URL || undefined,
  );
}

export async function syncEquipmentResearchDiscordCard(
  projectKey: string,
): Promise<"synced" | "idle" | "failed" | "pass_limit"> {
  return drainResearchDiscordCardSync(projectKey, {
    newLeaseToken: randomUUID,
    acquire: async (key, leaseToken) => {
      const card = await acquireEquipmentResearchDiscordCardLease({
        projectKey: key,
        leaseToken,
      });
      return card
        ? {
            projectKey: card._id,
            requestedRevision: card.requestedRevision,
            ...(card.messageId ? { messageId: card.messageId } : {}),
            leaseToken,
          }
        : null;
    },
    buildPayload: buildCurrentResearchDiscordPayload,
    deleteMessage: deleteEquipmentResearchDiscordCard,
    createMessage: createEquipmentResearchDiscordCard,
    complete: completeEquipmentResearchDiscordCardSync,
    confirm: isEquipmentResearchDiscordCardSyncComplete,
    fail: failEquipmentResearchDiscordCardSync,
    warn: (message, error) => console.warn(message, error),
  });
}
