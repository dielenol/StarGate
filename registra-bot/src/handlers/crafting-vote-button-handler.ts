import type { ButtonInteraction } from "discord.js";
import { GuildMember, MessageFlags } from "discord.js";
import {
  findCraftingVoteById,
  recordCraftingVoteBallot,
} from "../db/crafting-votes.js";
import {
  getCraftingVotePhase,
  isCanonicalCraftingVoteSource,
  parseCraftingVoteButtonCustomId,
} from "../services/crafting-vote.js";
import {
  buildCraftingVoteActionRow,
  buildCraftingVoteEmbed,
} from "../utils/crafting-vote-view.js";

async function hasEligibleRole(
  interaction: ButtonInteraction,
  eligibleRoleId: string
): Promise<boolean> {
  const member = interaction.member;
  if (member instanceof GuildMember) {
    return member.roles.cache.has(eligibleRoleId);
  }
  if (member && Array.isArray(member.roles)) {
    return member.roles.includes(eligibleRoleId);
  }
  if (!interaction.guild) return false;
  try {
    const fetched = await interaction.guild.members.fetch(interaction.user.id);
    return fetched.roles.cache.has(eligibleRoleId);
  } catch {
    return false;
  }
}

async function replyEphemeral(
  interaction: ButtonInteraction,
  content: string
): Promise<void> {
  await interaction
    .followUp({ content, flags: MessageFlags.Ephemeral })
    .catch(() => {});
}

export async function handleCraftingVoteButton(
  interaction: ButtonInteraction
): Promise<void> {
  const parsed = parseCraftingVoteButtonCustomId(interaction.customId);
  if (!parsed) return;

  await interaction.deferUpdate();
  if (!interaction.guildId) {
    await replyEphemeral(interaction, "■ 길드에서만 투표할 수 있습니다.");
    return;
  }

  const vote = await findCraftingVoteById(parsed.voteId, interaction.guildId);
  if (!vote) {
    await replyEphemeral(interaction, "■ 해당 사용 투표를 찾지 못했습니다.");
    return;
  }

  if (
    !isCanonicalCraftingVoteSource(vote, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
    })
  ) {
    await replyEphemeral(
      interaction,
      "■ 원장에 연결된 공식 투표 공지가 아닙니다. 이 버튼의 응답은 기록하지 않았습니다."
    );
    return;
  }

  const now = new Date();
  if (getCraftingVotePhase(vote, now) !== "OPEN") {
    await interaction.message
      .edit({
        embeds: [buildCraftingVoteEmbed(vote, now)],
        components: [buildCraftingVoteActionRow(vote, now)],
      })
      .catch(() => {});
    await replyEphemeral(
      interaction,
      "※ 응답 접수가 끝났습니다. 이 건은 유효표 과반 판정을 기다립니다."
    );
    return;
  }

  if (!(await hasEligibleRole(interaction, vote.eligibleRoleId))) {
    await replyEphemeral(
      interaction,
      "■ 이 투표에 지정된 관료 역할을 보유한 인원만 응답할 수 있습니다."
    );
    return;
  }

  const displayName =
    (interaction.member as { displayName?: string } | null)?.displayName ??
    interaction.user.globalName ??
    interaction.user.username;
  const updated = await recordCraftingVoteBallot({
    voteId: parsed.voteId,
    guildId: interaction.guildId,
    discordUserId: interaction.user.id,
    displayName,
    choice: parsed.choice,
    submittedAt: now,
  });
  if (!updated) {
    await replyEphemeral(
      interaction,
      "※ 마감 또는 과반 결론과 동시에 처리되어 표를 기록하지 않았습니다. 현황을 다시 확인하십시오."
    );
    return;
  }

  // 각 edit 뒤 단조 증가 revision을 재조회합니다. 더 최신 ballot/과반 결론이
  // 확인되면 다시 렌더해, 먼저 시작한 handler가 마지막에 stale 화면을 남기지 않습니다.
  let renderVote = updated;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await interaction.message.edit({
        embeds: [buildCraftingVoteEmbed(renderVote)],
        components: [buildCraftingVoteActionRow(renderVote)],
      });
    } catch (err) {
      console.error("[crafting-vote] tally message update failed", err);
      break;
    }

    const latest = await findCraftingVoteById(
      parsed.voteId,
      interaction.guildId
    );
    if (!latest || latest.revision === renderVote.revision) break;
    renderVote = latest;
  }

  const label = parsed.choice === "YES" ? "사용 동의" : "사용 반대";
  await replyEphemeral(
    interaction,
    `◆ **${label}** 응답을 기록했습니다. 재클릭하면 기존 응답을 덮어씁니다.\n※ 마감 뒤 결론 명령이 유효표 과반으로 판정합니다.`
  );
}
