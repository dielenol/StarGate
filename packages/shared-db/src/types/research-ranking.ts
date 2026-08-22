import type { ObjectId } from "mongodb";

export const RESEARCH_RANKING_STATE_COLLECTION = "research_ranking_states";
export const RESEARCH_RANKING_STATE_ID = "team-research-all-time";

export interface ResearchContributionRankingRow {
  /** 결정적 동률 정렬용 내부 값. 공개 응답에는 포함하지 않는다. */
  contributorCharacterId: string;
  contributorCodename: string;
  totalCredits: number;
  contributionCount: number;
  lastContributedAt: Date;
}

export interface ResearchHallOfFameResponse {
  period: "ALL_TIME";
  cadence: "DAILY_21_KST";
  generatedAt: string;
  items: Array<{
    rank: 1 | 2 | 3;
    codename: string;
    totalCredits: number;
    contributionCount: number;
  }>;
}

export interface ResearchRankingDiscordPayload {
  username: string;
  avatar_url?: string;
  allowed_mentions: { parse: string[] };
  embeds: Array<{
    title: string;
    url?: string;
    description?: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp: string;
  }>;
}

export interface ResearchRankingState {
  _id: typeof RESEARCH_RANKING_STATE_ID;
  requestedRevision: number;
  syncedRevision: number;
  desiredDate: string;
  desiredGeneratedAt: Date;
  desiredSourceRevision: string;
  desiredFormatRevision: string;
  desiredPayloads: ResearchRankingDiscordPayload[];
  publicSnapshot: ResearchHallOfFameResponse;
  messageIds?: string[];
  replacementMessageIds?: string[];
  staleMessageIds?: string[];
  cleanupMessageIds?: string[];
  leaseToken?: string;
  leaseExpiresAt?: Date;
  nextAttemptAt?: Date;
  lastError?: string;
  /** Webhook POST 결과 유실로 자동 재발행을 중단한 revision. */
  deliveryUnknownRevision?: number;
  deliveryUnknownAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamResearchContribution {
  _id?: ObjectId | string;
  scope: string;
  action: string;
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  createdAt: Date;
}
