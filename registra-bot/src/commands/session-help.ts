/**
 * /도움말 · /help 슬래시 커맨드 핸들러
 *
 * 권한에 따라 참여자용/운영자용 안내 임베드를 에페메랄로 출력합니다.
 * @module commands/session-help
 */

import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

import { REGISTRAR_SIGNATURE } from "../constants/registrar.js";
import { Help } from "../constants/registrar-voice.js";

import { hasManageGuildAfterDeferred } from "../utils/require-manage-guild.js";

const EMBED_COLOR = 0xc5a059;

function buildPlayerHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(Help.playerTitle)
    .setColor(EMBED_COLOR)
    .setDescription(Help.playerDesc)
    .addFields(Help.playerFields.map((f) => ({ ...f })))
    .setFooter({ text: `${Help.playerFooter}\n— ${REGISTRAR_SIGNATURE}` });
}

function buildAdminHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(Help.adminTitle)
    .setColor(EMBED_COLOR)
    .setDescription(Help.adminDesc)
    .addFields(Help.adminFields.map((f) => ({ ...f })))
    .setFooter({ text: `${Help.adminFooter}\n— ${REGISTRAR_SIGNATURE}` });
}

/**
 * /도움말·/help 명령을 처리합니다. 권한에 따라 임베드 내용이 분기됩니다.
 * @param interaction 슬래시 커맨드 인터랙션
 */
export async function handleHelp(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const isAdmin = await hasManageGuildAfterDeferred(interaction);
  const embed = isAdmin ? buildAdminHelpEmbed() : buildPlayerHelpEmbed();

  await interaction.editReply({ embeds: [embed] });
}
