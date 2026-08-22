import { getDb } from "../client.js";
import type {
  ResearchContributionRankingRow,
  TeamResearchContribution,
} from "../types/research-ranking.js";

const RESEARCH_CONTRIBUTIONS_COLLECTION = "research_contributions";

function contributionId(value: TeamResearchContribution): string {
  return value._id?.toString() ?? "";
}

/** Fixture와 Mongo 집계가 공유하는 결정적 reference implementation. */
export function buildTeamResearchContributionRankings(
  contributions: readonly TeamResearchContribution[],
  limit = 3,
): ResearchContributionRankingRow[] {
  const grouped = new Map<string, ResearchContributionRankingRow & {
    latestContributionId: string;
  }>();

  for (const contribution of contributions) {
    if (
      contribution.scope !== "team" ||
      (contribution.action !== "fund" && contribution.action !== "rush") ||
      contribution.amount <= 0
    ) {
      continue;
    }

    const existing = grouped.get(contribution.contributorCharacterId);
    const nextTime = contribution.createdAt.getTime();
    const nextId = contributionId(contribution);
    if (!existing) {
      grouped.set(contribution.contributorCharacterId, {
        contributorCharacterId: contribution.contributorCharacterId,
        contributorCodename: contribution.contributorCodename,
        totalCredits: contribution.amount,
        contributionCount: 1,
        lastContributedAt: contribution.createdAt,
        latestContributionId: nextId,
      });
      continue;
    }

    existing.totalCredits += contribution.amount;
    existing.contributionCount += 1;
    const existingTime = existing.lastContributedAt.getTime();
    if (
      nextTime > existingTime ||
      (nextTime === existingTime && nextId > existing.latestContributionId)
    ) {
      existing.contributorCodename = contribution.contributorCodename;
      existing.lastContributedAt = contribution.createdAt;
      existing.latestContributionId = nextId;
    }
  }

  return [...grouped.values()]
    .sort((left, right) => {
      if (right.totalCredits !== left.totalCredits) {
        return right.totalCredits - left.totalCredits;
      }
      const timeDelta =
        right.lastContributedAt.getTime() - left.lastContributedAt.getTime();
      if (timeDelta !== 0) return timeDelta;
      if (left.contributorCharacterId === right.contributorCharacterId) {
        return 0;
      }
      return left.contributorCharacterId < right.contributorCharacterId
        ? -1
        : 1;
    })
    .slice(0, Math.max(0, limit))
    .map(({ latestContributionId: _latestContributionId, ...row }) => row);
}

/** 연구 원장 전체 기간을 Mongo에서 집계한다. 별도 1,000건 상한을 두지 않는다. */
export async function listTeamResearchContributionRankings(
  limit = 3,
): Promise<ResearchContributionRankingRow[]> {
  const safeLimit = Math.max(0, Math.min(100, Math.floor(limit)));
  if (safeLimit === 0) return [];

  const db = await getDb();
  return db
    .collection<TeamResearchContribution>(RESEARCH_CONTRIBUTIONS_COLLECTION)
    .aggregate<ResearchContributionRankingRow>([
      {
        $match: {
          scope: "team",
          action: { $in: ["fund", "rush"] },
          amount: { $gt: 0 },
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$contributorCharacterId",
          contributorCodename: { $first: "$contributorCodename" },
          totalCredits: { $sum: "$amount" },
          contributionCount: { $sum: 1 },
          lastContributedAt: { $first: "$createdAt" },
        },
      },
      { $sort: { totalCredits: -1, lastContributedAt: -1, _id: 1 } },
      { $limit: safeLimit },
      {
        $project: {
          _id: 0,
          contributorCharacterId: "$_id",
          contributorCodename: 1,
          totalCredits: 1,
          contributionCount: 1,
          lastContributedAt: 1,
        },
      },
    ])
    .toArray();
}
