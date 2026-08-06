import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { REGISTRAR_COLORS, REGISTRAR_SIGNATURE } from "../constants/registrar.js";
import {
  buildCraftingVoteButtonCustomId,
  countCraftingVoteBallots,
  getCraftingVotePhase,
} from "../services/crafting-vote.js";
import type { CraftingVote } from "../types/crafting-vote.js";

function discordTimestamp(date: Date, style: "F" | "R"): string {
  return `<t:${Math.floor(date.getTime() / 1_000)}:${style}>`;
}

function inline(value: string): string {
  return value.replaceAll("`", "ˋ").slice(0, 180);
}

function phaseLabel(vote: CraftingVote, now: Date): string {
  const phase = getCraftingVotePhase(vote, now);
  if (phase === "PUBLISH_PENDING") return "공지 전달 확인 대기";
  if (phase === "OPEN") return "응답 접수 중";
  if (phase === "CLOSED_PENDING_RESOLUTION") return "마감 · 과반 판정 대기";
  const outcome = vote.resolution?.outcome;
  return outcome === "APPROVED" ? "과반 승인" : "과반 미달";
}

export function buildCraftingVoteEmbed(
  vote: CraftingVote,
  now = new Date()
): EmbedBuilder {
  const tally = countCraftingVoteBallots(vote);
  const phase = getCraftingVotePhase(vote, now);
  const embed = new EmbedBuilder()
    .setColor(REGISTRAR_COLORS.primary)
    .setTitle("【사용 동의 투표】 CENSOR-3")
    .setDescription(
      [
        `**${vote.subject.displayName}**`,
        `사용 대상: **${vote.subject.targetCharacterCodename}** · ${vote.subject.usageQuantity}발`,
        "",
        "이 투표는 CENSOR-3 한 발 사용 동의를 기록합니다. 마감 뒤 유효표의 과반이 찬성해야 승인되며, 동률·무투표는 반려됩니다.",
      ].join("\n")
    )
    .addFields(
      {
        name: "상태",
        value: `**${phaseLabel(vote, now)}**`,
        inline: true,
      },
      {
        name: "집계",
        value: `동의 **${tally.yes}** · 반대 **${tally.no}**`,
        inline: true,
      },
      {
        name: "투표 역할",
        value: `<@&${vote.eligibleRoleId}>`,
        inline: true,
      },
      {
        name: "응답 마감",
        value: `${discordTimestamp(vote.closesAt, "F")} (${discordTimestamp(vote.closesAt, "R")})`,
        inline: false,
      },
      {
        name: "요청 참조",
        value: `\`${inline(vote.requestRef)}\``,
        inline: false,
      }
    )
    .setFooter({
      text: `${REGISTRAR_SIGNATURE} · 유효표 과반 · 승인 1건당 1발`,
    });

  if (phase === "RESOLVED" && vote.resolution) {
    embed.addFields({
      name: "과반 판정",
      value: inline(vote.resolution.reason),
      inline: false,
    });
  }

  if (vote._id) {
    embed.setAuthor({ name: `투표 ID · ${vote._id.toHexString()}` });
  }
  return embed;
}

export function buildCraftingVoteActionRow(
  vote: CraftingVote,
  now = new Date()
): ActionRowBuilder<ButtonBuilder> {
  const disabled = getCraftingVotePhase(vote, now) !== "OPEN";
  const voteId = vote._id?.toHexString() ?? "invalid";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCraftingVoteButtonCustomId(voteId, "YES"))
      .setLabel("사용 동의")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(buildCraftingVoteButtonCustomId(voteId, "NO"))
      .setLabel("사용 반대")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}
