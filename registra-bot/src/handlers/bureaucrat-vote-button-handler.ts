import {
  BUREAUCRAT_VOTE_CHANNEL_ID,
  findBureaucratVoteById,
  recordBureaucratVoteBallot,
} from "@stargate/shared-db";
import {
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";

import {
  isCanonicalBureaucratVoteSource,
  parseBureaucratVoteButtonCustomId,
} from "../services/bureaucrat-vote.js";
import {
  closeBureaucratVoteWithRetry,
  refreshBureaucratVoteMessage,
} from "../services/bureaucrat-vote-runtime.js";

async function replyEphemeral(
  interaction: ButtonInteraction,
  content: string,
): Promise<void> {
  await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

async function canCloseVote(interaction: ButtonInteraction, creatorId?: string) {
  if (creatorId && interaction.user.id === creatorId) return true;
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  const member = interaction.member;
  if (member instanceof GuildMember) {
    return (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  }
  if (!interaction.guild) return false;
  try {
    const fetched = await interaction.guild.members.fetch(interaction.user.id);
    return (
      fetched.permissions.has(PermissionFlagsBits.Administrator) ||
      fetched.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  } catch {
    return false;
  }
}

export async function handleBureaucratVoteButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parseBureaucratVoteButtonCustomId(interaction.customId);
  if (!parsed) return;
  await interaction.deferUpdate();

  if (
    !interaction.guildId ||
    interaction.channelId !== BUREAUCRAT_VOTE_CHANNEL_ID
  ) {
    await replyEphemeral(interaction, "■ 지정 관료 채널의 공식 표결에서만 응답할 수 있습니다.");
    return;
  }
  const vote = await findBureaucratVoteById(parsed.voteId);
  if (!vote) {
    await replyEphemeral(interaction, "■ 해당 표결 원장을 찾지 못했습니다.");
    return;
  }
  if (
    !isCanonicalBureaucratVoteSource(vote, {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.message.id,
    })
  ) {
    await replyEphemeral(interaction, "■ 원장에 연결된 공식 표결 공지가 아닙니다.");
    return;
  }
  if (vote.status === "CLOSED" || vote.closesAt.getTime() <= Date.now()) {
    await refreshBureaucratVoteMessage(interaction.client, vote);
    await replyEphemeral(interaction, "※ 이미 응답 기한이 종료된 안건입니다.");
    return;
  }

  if (parsed.action === "CLOSE") {
    const creatorId = vote.createdBy.kind === "DISCORD_USER"
      ? vote.createdBy.id
      : undefined;
    if (!(await canCloseVote(interaction, creatorId))) {
      await replyEphemeral(
        interaction,
        "■ 투표 종료는 안건 생성자 또는 서버 관리자만 실행할 수 있습니다.",
      );
      return;
    }
    const closed = await closeBureaucratVoteWithRetry({
      voteId: parsed.voteId,
      trigger: "MANUAL",
      closedBy: {
        kind: "DISCORD_USER",
        id: interaction.user.id,
        displayName:
          (interaction.member as { displayName?: string } | null)?.displayName ??
          interaction.user.globalName ??
          interaction.user.username,
      },
    });
    if (!closed) {
      await replyEphemeral(interaction, "■ 표결 종료가 다른 응답과 경합했습니다. 다시 시도하십시오.");
      return;
    }
    await refreshBureaucratVoteMessage(interaction.client, closed);
    await replyEphemeral(
      interaction,
      `◆ 표결을 종료했습니다. 결과: **${closed.resolution?.outcome === "APPROVED" ? "가결" : "부결"}**`,
    );
    return;
  }

  const displayName =
    (interaction.member as { displayName?: string } | null)?.displayName ??
    interaction.user.globalName ??
    interaction.user.username;
  const updated = await recordBureaucratVoteBallot({
    voteId: parsed.voteId,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: interaction.message.id,
    discordUserId: interaction.user.id,
    displayName,
    choice: parsed.action,
  });
  if (!updated) {
    await replyEphemeral(interaction, "※ 마감과 동시에 처리되어 응답을 기록하지 않았습니다.");
    return;
  }
  await refreshBureaucratVoteMessage(interaction.client, updated);
  await replyEphemeral(
    interaction,
    `◆ **${parsed.action === "YES" ? "찬성" : "반대"}** 응답을 기록했습니다. 기한 내 재선택하면 기존 표를 덮어씁니다.`,
  );
}
