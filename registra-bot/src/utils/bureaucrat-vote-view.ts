import type { BureaucratVote } from "@stargate/shared-db";
import { countBureaucratVoteBallots } from "@stargate/shared-db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

import { REGISTRAR_COLORS, REGISTRAR_SIGNATURE } from "../constants/registrar.js";
import {
  bureaucratVoteAuthorLabel,
  buildBureaucratVoteButtonCustomId,
  getBureaucratVotePhase,
} from "../services/bureaucrat-vote.js";

function discordTimestamp(date: Date, style: "F" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:${style}>`;
}

function phaseLabel(vote: BureaucratVote, now: Date): string {
  if (vote.status === "CLOSED") {
    return vote.resolution?.outcome === "APPROVED" ? "가결" : "부결";
  }
  if (vote.closesAt.getTime() <= now.getTime()) return "마감 처리 중";
  if (vote.publication.state !== "SENT") return "등재 대기";
  return "응답 접수 중";
}

function creatorLabel(vote: BureaucratVote): string {
  return vote.createdBy.kind === "DISCORD_USER"
    ? `<@${vote.createdBy.id}>`
    : vote.createdBy.displayName;
}

function sourceLabel(vote: BureaucratVote): string {
  if (vote.source === "WORKSHOP") return "ERP 공방 조건부 견적";
  if (vote.source === "ERP_PRESET") return "ERP 고정 안건";
  return "Discord 직접 안건";
}

function siteBaseUrl(): string {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_BASE_URL?.trim() ||
    "https://www.ordonet.co.kr";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "https://www.ordonet.co.kr";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "https://www.ordonet.co.kr";
  }
}

export function buildBureaucratVoteEmbed(
  vote: BureaucratVote,
  now = new Date(),
): EmbedBuilder {
  const tally = countBureaucratVoteBallots(vote);
  const embed = new EmbedBuilder()
    .setColor(REGISTRAR_COLORS.primary)
    .setTitle(`【관료 표결】 ${vote.title}`)
    .setDescription(vote.content)
    .addFields(
      { name: "상태", value: `**${phaseLabel(vote, now)}**`, inline: true },
      {
        name: "집계",
        value: `찬성 **${tally.yes}** · 반대 **${tally.no}**`,
        inline: true,
      },
      { name: "등재자", value: creatorLabel(vote), inline: true },
      { name: "원본 업무", value: sourceLabel(vote), inline: true },
      {
        name: "자동 마감",
        value: `${discordTimestamp(vote.closesAt, "F")} (${discordTimestamp(vote.closesAt, "R")})`,
        inline: false,
      },
    )
    .setFooter({
      text: `${REGISTRAR_SIGNATURE} · 유효표 과반 · 동률·무투표 부결 · 생성 후 6시간`,
    });

  if (vote.workshopRef) {
    embed.addFields({
      name: "연결된 공방 요청",
      value: `견적 v${vote.workshopRef.quoteVersion} · [ERP 공방 운영에서 확인](${siteBaseUrl()}/erp/admin/equipment-workshop)\n원장 참조: ${vote.workshopRef.requestId}`,
      inline: false,
    });
  }

  if (vote.status === "CLOSED" && vote.resolution) {
    embed.addFields({
      name: "사무국 판정",
      value: `${vote.resolution.outcome === "APPROVED" ? "**가결**" : "**부결**"} · ${vote.resolution.reason}`,
      inline: false,
    });
  }
  if (vote._id) {
    embed.setAuthor({ name: bureaucratVoteAuthorLabel(vote._id.toHexString()) });
  }
  return embed;
}

export function buildBureaucratVoteActionRow(
  vote: BureaucratVote,
  now = new Date(),
): ActionRowBuilder<ButtonBuilder> {
  const disabled = getBureaucratVotePhase(vote, now) !== "OPEN";
  const voteId = vote._id?.toHexString() ?? "invalid";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildBureaucratVoteButtonCustomId(voteId, "YES"))
      .setLabel("찬성")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buildBureaucratVoteButtonCustomId(voteId, "NO"))
      .setLabel("반대")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buildBureaucratVoteButtonCustomId(voteId, "CLOSE"))
      .setLabel("투표 종료")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export function buildBureaucratVoteMessage(vote: BureaucratVote) {
  return {
    content:
      "■ 사무국 심의 안건이 등재되었습니다. 관료 여러분께서는 기한 내 의사를 표명하십시오.",
    embeds: [buildBureaucratVoteEmbed(vote)],
    components: [buildBureaucratVoteActionRow(vote)],
  };
}
