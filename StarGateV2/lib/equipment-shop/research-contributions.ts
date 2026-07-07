export type EquipmentResearchContributionAction =
  | "fund"
  | "rush"
  | "start"
  | "apply";

export interface ResearchContributionLike {
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  createdAt: Date | string;
}

export interface ResearchContributionRanking {
  contributorCharacterId: string;
  contributorCodename: string;
  totalAmount: number;
  contributionCount: number;
  lastContributedAt: Date;
}

export function clampTeamResearchContribution(args: {
  targetCost: number;
  fundedAmount: number;
  requestedAmount: number;
}): number {
  const remaining = Math.max(0, args.targetCost - args.fundedAmount);
  if (!Number.isInteger(args.requestedAmount) || args.requestedAmount <= 0) {
    return 0;
  }
  return Math.min(args.requestedAmount, remaining);
}

export function buildResearchContributionRankings(
  contributions: readonly ResearchContributionLike[],
): ResearchContributionRanking[] {
  const byCharacter = new Map<string, ResearchContributionRanking>();

  for (const contribution of contributions) {
    if (contribution.amount <= 0) continue;
    const contributedAt =
      contribution.createdAt instanceof Date
        ? contribution.createdAt
        : new Date(contribution.createdAt);
    const existing = byCharacter.get(contribution.contributorCharacterId);
    if (existing) {
      existing.totalAmount += contribution.amount;
      existing.contributionCount += 1;
      if (contributedAt > existing.lastContributedAt) {
        existing.lastContributedAt = contributedAt;
      }
      continue;
    }

    byCharacter.set(contribution.contributorCharacterId, {
      contributorCharacterId: contribution.contributorCharacterId,
      contributorCodename: contribution.contributorCodename,
      totalAmount: contribution.amount,
      contributionCount: 1,
      lastContributedAt: contributedAt,
    });
  }

  return Array.from(byCharacter.values()).sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return b.lastContributedAt.getTime() - a.lastContributedAt.getTime();
  });
}
