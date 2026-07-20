export interface ResearchDiscordContributionLike {
  action: "fund" | "rush" | "start" | "apply";
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  rushHours?: number;
  createdAt: Date | string;
}

export interface ResearchDiscordContributorTotal {
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  rushHours: number;
  lastContributedAt: Date;
}

export interface ResearchDiscordCardSnapshot {
  projectKey: string;
  projectName: string;
  targetCost: number;
  fundedAmount: number;
  fundingStatus: "funding" | "started" | "cancelled";
  project?: {
    status: "in_progress" | "applying" | "applied";
    completedAt: Date;
    appliedAt?: Date;
  };
  contributions: readonly ResearchDiscordContributionLike[];
  updatedAt: Date;
  labUrl: string;
}

export interface ResearchDiscordPayload {
  username: string;
  avatar_url?: string;
  allowed_mentions: { parse: string[] };
  embeds: Array<{
    title: string;
    url: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    footer: { text: string };
    timestamp: string;
  }>;
}

const DISCORD_FIELD_VALUE_MAX = 1000;
const DISCORD_RESEARCH_COLOR = 0x9bd8ec;

export function sanitizeResearchDiscordText(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

function contributionTime(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function sortContributorTotals(
  rows: ResearchDiscordContributorTotal[],
): ResearchDiscordContributorTotal[] {
  return rows.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return b.lastContributedAt.getTime() - a.lastContributedAt.getTime();
  });
}

export function aggregateResearchDiscordContributions(
  contributions: readonly ResearchDiscordContributionLike[],
): {
  funding: ResearchDiscordContributorTotal[];
  rush: ResearchDiscordContributorTotal[];
} {
  const funding = new Map<string, ResearchDiscordContributorTotal>();
  const rush = new Map<string, ResearchDiscordContributorTotal>();

  for (const contribution of contributions) {
    if (
      contribution.amount <= 0 ||
      (contribution.action !== "fund" && contribution.action !== "rush")
    ) {
      continue;
    }

    const contributedAt = contributionTime(contribution.createdAt);
    const target = contribution.action === "fund" ? funding : rush;
    const existing = target.get(contribution.contributorCharacterId);
    if (existing) {
      existing.amount += contribution.amount;
      existing.rushHours += contribution.rushHours ?? 0;
      if (contributedAt >= existing.lastContributedAt) {
        existing.contributorCodename = contribution.contributorCodename;
        existing.lastContributedAt = contributedAt;
      }
      continue;
    }

    target.set(contribution.contributorCharacterId, {
      contributorCharacterId: contribution.contributorCharacterId,
      contributorCodename: contribution.contributorCodename,
      amount: contribution.amount,
      rushHours: contribution.rushHours ?? 0,
      lastContributedAt: contributedAt,
    });
  }

  return {
    funding: sortContributorTotals(Array.from(funding.values())),
    rush: sortContributorTotals(Array.from(rush.values())),
  };
}

function formatCredits(amount: number): string {
  return `${amount.toLocaleString("ko-KR")} CR`;
}

function formatContributorRows(
  rows: readonly ResearchDiscordContributorTotal[],
  line: (row: ResearchDiscordContributorTotal) => string,
): string {
  if (rows.length === 0) return "기록 없음";

  const lines: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const next = line(rows[index]!);
    const remaining = rows.length - index - 1;
    const suffix = remaining > 0 ? `\n외 ${remaining}명` : "";
    const candidate = [...lines, next].join("\n") + suffix;
    if (candidate.length > DISCORD_FIELD_VALUE_MAX) {
      const omitted = rows.length - index;
      const omittedLine = `외 ${omitted}명`;
      if ([...lines, omittedLine].join("\n").length <= DISCORD_FIELD_VALUE_MAX) {
        lines.push(omittedLine);
      }
      break;
    }
    lines.push(next);
  }
  return lines.join("\n");
}

function getResearchStatus(snapshot: ResearchDiscordCardSnapshot): string {
  if (snapshot.project?.status === "applied") return "연구 적용 완료";
  if (snapshot.project?.status === "applying") return "완료 적용 중";
  if (snapshot.project?.status === "in_progress") {
    return snapshot.project.completedAt.getTime() <= snapshot.updatedAt.getTime()
      ? "완료 적용 대기"
      : "연구 진행 중";
  }
  if (snapshot.fundingStatus === "cancelled") return "연구 취소";
  return "연구비 모금 중";
}

function formatKstTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function discordTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

export function buildResearchDiscordCardPayload(
  snapshot: ResearchDiscordCardSnapshot,
  avatarUrl?: string,
): ResearchDiscordPayload {
  const totals = aggregateResearchDiscordContributions(snapshot.contributions);
  const fundingRows = formatContributorRows(
    totals.funding,
    (row) =>
      `**${sanitizeResearchDiscordText(row.contributorCodename)}** — ${formatCredits(row.amount)}`,
  );
  const rushRows = formatContributorRows(
    totals.rush,
    (row) =>
      `**${sanitizeResearchDiscordText(row.contributorCodename)}** — ${formatCredits(row.amount)} · ${row.rushHours.toLocaleString("ko-KR")}시간 단축`,
  );
  const fields: ResearchDiscordPayload["embeds"][number]["fields"] = [
    { name: "상태", value: getResearchStatus(snapshot), inline: true },
    {
      name: "진행",
      value: `${snapshot.fundedAmount.toLocaleString("ko-KR")} / ${snapshot.targetCost.toLocaleString("ko-KR")} CR`,
      inline: true,
    },
  ];

  if (snapshot.project) {
    fields.push({
      name: snapshot.project.status === "applied" ? "적용 완료" : "완료 예정",
      value: discordTimestamp(
        snapshot.project.appliedAt ?? snapshot.project.completedAt,
      ),
      inline: false,
    });
  }
  fields.push({ name: "연구비 기여", value: fundingRows });
  if (totals.rush.length > 0) {
    fields.push({ name: "가속 투입", value: rushRows });
  }

  return {
    username: "NOVUS Research Lab",
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `팀 연구 · ${sanitizeResearchDiscordText(snapshot.projectKey)} — ${sanitizeResearchDiscordText(snapshot.projectName)}`.slice(
          0,
          256,
        ),
        url: snapshot.labUrl,
        color: DISCORD_RESEARCH_COLOR,
        fields,
        footer: { text: `최종 갱신 · ${formatKstTimestamp(snapshot.updatedAt)}` },
        timestamp: snapshot.updatedAt.toISOString(),
      },
    ],
  };
}
