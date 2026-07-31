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

/**
 * 프로덕션 랭킹 경로는 `lib/db/equipment-research.ts` 의 aggregation 파이프라인이다.
 * 본 함수는 그 파이프라인의 reference oracle (research-contributions.test.mjs 가 검증) —
 * 랭킹 semantics(모수 1000 · 최신 codename · 2-key 정렬) 변경 시 양쪽을 함께 수정할 것.
 */
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
