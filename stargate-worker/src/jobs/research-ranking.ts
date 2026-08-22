import { createHash } from "node:crypto";

import {
  RESEARCH_RANKING_FORMAT_REVISION,
  buildResearchHallOfFameResponse,
  buildResearchRankingDiscordPayloads,
} from "@stargate/core/domain/research-ranking";
import {
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
  getDb,
  listTeamResearchContributionRankings,
  type ResearchContributionRankingRow,
  type ResearchRankingState,
} from "@stargate/shared-db";
import {
  MongoServerError,
  type Db,
  type Filter,
  type UpdateFilter,
} from "mongodb";

export interface ResearchRankingStateRequestResult {
  status: "requested" | "current";
  contributorCount: number;
  sourceRevision: string;
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

export function researchRankingSourceRevision(
  rows: readonly ResearchContributionRankingRow[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          contributorCharacterId: row.contributorCharacterId,
          contributorCodename: row.contributorCodename,
          totalCredits: row.totalCredits,
          contributionCount: row.contributionCount,
          lastContributedAt: row.lastContributedAt.toISOString(),
        })),
      ),
    )
    .digest("hex");
}

export async function requestDailyResearchRankingState(
  date: string,
  generatedAt: Date,
  dependencies: {
    listRankings?: typeof listTeamResearchContributionRankings;
    getDbImpl?: typeof getDb;
    siteBaseUrl?: string;
    avatarUrl?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ResearchRankingStateRequestResult> {
  dependencies.signal?.throwIfAborted();
  const rows = await (
    dependencies.listRankings ?? listTeamResearchContributionRankings
  )(3);
  dependencies.signal?.throwIfAborted();
  const publicSnapshot = buildResearchHallOfFameResponse(rows, generatedAt);
  const sourceRevision = researchRankingSourceRevision(rows);
  const desiredPayloads = buildResearchRankingDiscordPayloads({
    snapshot: publicSnapshot,
    siteBaseUrl: dependencies.siteBaseUrl ?? siteBaseUrl(process.env),
    avatarUrl:
      dependencies.avatarUrl ??
      process.env.DISCORD_WEBHOOK_RESEARCH_AVATAR_URL?.trim(),
  });
  const db: Db = await (dependencies.getDbImpl ?? getDb)();
  dependencies.signal?.throwIfAborted();
  const collection = db.collection<ResearchRankingState>(
    RESEARCH_RANKING_STATE_COLLECTION,
  );
  const now = new Date();
  const mutation: UpdateFilter<ResearchRankingState> = {
    $inc: { requestedRevision: 1 },
    $setOnInsert: { syncedRevision: 0, createdAt: now },
    $set: {
      desiredDate: date,
      desiredGeneratedAt: generatedAt,
      desiredSourceRevision: sourceRevision,
      desiredFormatRevision: RESEARCH_RANKING_FORMAT_REVISION,
      desiredPayloads,
      publicSnapshot,
      updatedAt: now,
    },
    // DELIVERY_UNKNOWN은 수동 reconciliation 전까지 원인과 CRITICAL 상태를
    // 보존한다. 새 desired revision은 backoff만 해제해 즉시 재평가한다.
    $unset: { nextAttemptAt: "" },
  };
  const changedFilter: Filter<ResearchRankingState> = {
    _id: RESEARCH_RANKING_STATE_ID,
    $or: [
      { desiredDate: { $exists: false } },
      { desiredDate: { $lt: date } },
      {
        desiredDate: date,
        $and: [
          {
            $or: [
              { desiredGeneratedAt: { $exists: false } },
              { desiredGeneratedAt: { $lte: generatedAt } },
            ],
          },
          {
            $or: [
              { desiredSourceRevision: { $ne: sourceRevision } },
              {
                desiredFormatRevision: {
                  $ne: RESEARCH_RANKING_FORMAT_REVISION,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    const updated = await collection.updateOne(changedFilter, mutation, {
      upsert: true,
    });
    if (updated.matchedCount === 1 || updated.upsertedCount === 1) {
      return {
        status: "requested",
        contributorCount: rows.length,
        sourceRevision,
      };
    }
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }
  }

  return {
    status: "current",
    contributorCount: rows.length,
    sourceRevision,
  };
}
