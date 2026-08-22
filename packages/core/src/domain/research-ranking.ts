import type {
  ResearchContributionRankingRow,
  ResearchHallOfFameResponse,
  ResearchRankingDiscordPayload,
} from "@stargate/shared-db";

export type {
  ResearchContributionRankingRow,
  ResearchHallOfFameResponse,
  ResearchRankingDiscordPayload,
} from "@stargate/shared-db";

export const RESEARCH_RANKING_FORMAT_REVISION = "research-ranking-card-v1";

const MEDALS = ["🥇 금상", "🥈 은상", "🥉 동상"] as const;

function sanitizeDiscordText(value: string): string {
  return value
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

export function buildResearchHallOfFameResponse(
  rows: readonly ResearchContributionRankingRow[],
  generatedAt: Date,
): ResearchHallOfFameResponse {
  return {
    period: "ALL_TIME",
    cadence: "DAILY_21_KST",
    generatedAt: generatedAt.toISOString(),
    items: rows.slice(0, 3).map((row, index) => ({
      rank: (index + 1) as 1 | 2 | 3,
      codename: row.contributorCodename,
      totalCredits: row.totalCredits,
      contributionCount: row.contributionCount,
    })),
  };
}

export function buildResearchRankingDiscordPayloads(input: {
  snapshot: ResearchHallOfFameResponse;
  siteBaseUrl: string;
  avatarUrl?: string;
}): ResearchRankingDiscordPayload[] {
  if (input.snapshot.items.length === 0) return [];

  const hallUrl = new URL("/erp/hall-of-fame", input.siteBaseUrl).toString();
  const generatedAt = new Date(input.snapshot.generatedAt);
  const fields = input.snapshot.items.map((item, index) => ({
    name: `${MEDALS[index]} · ${sanitizeDiscordText(item.codename)}`,
    value: `누적 **${item.totalCredits.toLocaleString("ko-KR")} CR** · 기여 **${item.contributionCount.toLocaleString("ko-KR")}회**`,
    inline: false,
  }));
  fields.push({
    name: "명예의 전당",
    value: `[연구 공로 시상대 보기](${hallUrl})`,
    inline: false,
  });

  return [
    {
      username: "NOVUS Research Lab",
      ...(input.avatarUrl ? { avatar_url: input.avatarUrl } : {}),
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: "팀 연구 누적 공로 TOP 3",
          url: hallUrl,
          description: "팀 연구 모금·가속에 투입한 전 기간 누적 CR 기준입니다.",
          color: 0xc5a059,
          fields,
          footer: {
            text: `${new Intl.DateTimeFormat("ko-KR", {
              timeZone: "Asia/Seoul",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(generatedAt)} KST 기준`,
          },
          timestamp: input.snapshot.generatedAt,
        },
      ],
    },
  ];
}
