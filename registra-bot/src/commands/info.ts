/**
 * /안내 · /info 슬래시 커맨드 핸들러
 *
 * 운영자가 채널에 봇 사용법 안내 임베드를 영구 게시합니다.
 * 진행 알림은 본인에게 ephemeral로, 안내 메시지는 대상 채널에 공개로 게시됩니다.
 *
 * @module commands/info
 */

import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";

import { REGISTRAR_COLORS, REGISTRAR_SIGNATURE } from "../constants/registrar.js";
import { D, Info, L } from "../constants/registrar-voice.js";
import { Opt } from "../slash/ko-names.js";

import { deferReplyAndRequireManageGuild } from "../utils/require-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";

/** `/안내` 임베드 빌드 — 채널 공개용 톤 */
function buildInfoEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(Info.title)
    .setColor(REGISTRAR_COLORS.primary)
    .setDescription(Info.desc)
    .addFields(Info.fields.map((f) => ({ ...f })))
    .setFooter({ text: `${Info.footerLine}\n— ${REGISTRAR_SIGNATURE}` });
}

/**
 * /안내·/info 명령을 처리합니다.
 * @param interaction 슬래시 커맨드 인터랙션
 */
export async function handleInfo(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // 권한 체크 + ephemeral defer (헬퍼가 내부에서 deferReply 처리)
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: D.guildOnly });
    return;
  }

  // 옵션 채널 우선, 없으면 명령 실행 채널
  const channelFromOpt = interaction.options.getChannel(Opt.channel);
  const shouldPin = interaction.options.getBoolean(Opt.pin) ?? false;

  const resolved = await resolveGuildTextSendChannel(
    guild,
    channelFromOpt,
    interaction.channelId
  );
  if (!resolved.ok) {
    await interaction.editReply({ content: resolved.message });
    return;
  }

  const target = resolved.channel;

  const embed = buildInfoEmbed();

  // 대상 채널에 공개 게시
  let message;
  try {
    message = await target.send({ embeds: [embed] });
  } catch (err) {
    console.error(L.infoSendFail, err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    const content = missingAccess
      ? Info.postedMissingAccess
      : Info.postedFail(err instanceof Error ? err.message : "원인 미상");
    await interaction.editReply({ content });
    return;
  }

  // 고정 옵션이 true면 pin 시도. 실패해도 게시는 성공으로 유지.
  let pinNote = "";
  if (shouldPin) {
    try {
      await message.pin();
    } catch (pinErr) {
      console.error(L.infoPinFail, pinErr);
      pinNote = Info.pinFailNote;
    }
  }

  await interaction.editReply({
    content: Info.postedOk(`<#${target.id}>`, message.id, pinNote),
  });
}
