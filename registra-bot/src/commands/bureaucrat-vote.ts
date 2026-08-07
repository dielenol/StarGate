import {
  BUREAUCRAT_VOTE_CHANNEL_ID,
  createBureaucratVote,
} from "@stargate/shared-db";
import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";

import {
  BureaucratVoteOpt,
  BureaucratVoteSub,
} from "../slash/ko-names.js";
import { publishBureaucratVoteById } from "../services/bureaucrat-vote-runtime.js";

export async function handleBureaucratVoteCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "■ 길드에서만 안건을 등재할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.channelId !== BUREAUCRAT_VOTE_CHANNEL_ID) {
    await interaction.reply({
      content: `■ 이 명령은 지정 관료 채널(<#${BUREAUCRAT_VOTE_CHANNEL_ID}>)에서만 사용할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.options.getSubcommand() !== BureaucratVoteSub.create) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const title = interaction.options.getString(BureaucratVoteOpt.title, true);
  const content = interaction.options.getString(BureaucratVoteOpt.content, true);
  const displayName =
    (interaction.member as { displayName?: string } | null)?.displayName ??
    interaction.user.globalName ??
    interaction.user.username;

  try {
    const result = await createBureaucratVote({
      requestKey: `discord:${interaction.guildId}:${interaction.id}`,
      source: "DISCORD_COMMAND",
      guildId: interaction.guildId,
      title,
      content,
      createdBy: {
        kind: "DISCORD_USER",
        id: interaction.user.id,
        displayName,
      },
    });
    const voteId = result.vote._id?.toHexString();
    const published = voteId
      ? await publishBureaucratVoteById(interaction.client, voteId).catch(
          (error) => {
            console.error(
              "[bureaucrat-vote] immediate publication deferred",
              voteId,
              error,
            );
            return null;
          },
        )
      : null;
    const closesAt = published?.closesAt ?? result.vote.closesAt;
    await interaction.editReply({
      content: [
        result.created
          ? "◆ 사무국 표결 안건을 등재했습니다."
          : "※ 같은 명령 요청으로 생성된 기존 안건을 확인했습니다.",
        published?.publication.state === "SENT"
          ? "공지 상태: 게시 완료"
          : "공지 상태: 게시 대기 · REGISTRAR가 자동 재시도합니다.",
        `자동 마감: <t:${Math.floor(closesAt.getTime() / 1_000)}:F>`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[bureaucrat-vote] command create failed", error);
    await interaction.editReply({
      content: `■ 안건을 등재하지 못했습니다. ${error instanceof Error ? error.message : "잠시 뒤 다시 시도하십시오."}`,
    });
  }
}
