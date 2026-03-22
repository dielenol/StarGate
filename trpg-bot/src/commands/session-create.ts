/**
 * /session create 슬래시 커맨드 핸들러
 *
 * 세션 생성, DB 저장, 공지 메시지 전송, 참석/불참/미정 버튼 렌더링을 담당합니다.
 * @module commands/session-create
 */

import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { createSession, updateSessionMessageId } from "../db/sessions.js";
import { buildSessionEmbed } from "../utils/embed.js";
/** 버튼 customId 접두사 (trpg:attend:{sessionId}:yes|no|maybe) */
const BUTTON_PREFIX = "trpg:attend:";

/**
 * 날짜 문자열을 Date로 파싱합니다.
 * "2026-03-22 20:00" 또는 "2026-03-22T20:00" 형식 지원
 * @param str 날짜 문자열
 * @returns Date 또는 null
 */
function parseDateTime(str: string): Date | null {
  const normalized = str.replace(" ", "T");
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/** Discord snowflake 형식 (17~19자리 숫자) */
const SNOWFLAKE_REGEX = /^\d{17,19}$/;

/**
 * 역할 ID를 추출합니다. @역할멘션 형식이면 ID만 추출합니다.
 * @here, @everyone은 역할이 아니므로 유효하지 않습니다.
 * @param value "123456789" 또는 "<@&123456789>"
 * @returns 역할 ID 또는 빈 문자열 (유효하지 않을 때)
 */
function extractRoleId(value: string): string {
  const match = value.match(/<@&(\d+)>/);
  const id = match ? match[1] : value.trim();
  return SNOWFLAKE_REGEX.test(id) ? id : "";
}

/**
 * /session create 명령어를 처리합니다.
 * @param interaction 슬래시 커맨드 인터랙션
 */
export async function handleSessionCreate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.options.getString("title", true);
  const dateStr = interaction.options.getString("date", true);
  const closeStr = interaction.options.getString("close", true);
  const roleOption = interaction.options.getString("role", true);
  const channelOption = interaction.options.getString("channel");

  const targetDateTime = parseDateTime(dateStr);
  const closeDateTime = parseDateTime(closeStr);

  if (!targetDateTime || !closeDateTime) {
    await interaction.editReply({
      content: "❌ 날짜 형식이 올바르지 않습니다. (예: 2026-03-22 20:00)",
    });
    return;
  }

  if (closeDateTime >= targetDateTime) {
    await interaction.editReply({
      content: "❌ 응답 마감일시는 세션 일시보다 이전이어야 합니다.",
    });
    return;
  }

  const targetRoleId = extractRoleId(roleOption);
  if (!targetRoleId) {
    await interaction.editReply({
      content:
        "❌ 참여 대상 역할을 올바르게 지정해 주세요. (역할 ID 또는 @역할멘션)\n@here, @everyone은 사용할 수 없습니다.",
    });
    return;
  }

  const channelId =
    channelOption?.trim() ??
    interaction.channelId ??
    interaction.channel?.id ??
    "";

  if (!channelId) {
    await interaction.editReply({
      content: "❌ 채널을 지정해 주세요.",
    });
    return;
  }

  const channel =
    interaction.channel?.id === channelId
      ? interaction.channel
      : await interaction.guild?.channels.fetch(channelId);

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await interaction.editReply({
      content: "❌ 지정한 채널을 찾을 수 없거나 텍스트 채널이 아닙니다.",
    });
    return;
  }

  const textChannel = channel as TextChannel;

  try {
    // DB에 세션 저장 (messageId는 공지 전송 후 업데이트)
    const sessionId = await createSession({
      guildId: interaction.guildId!,
      channelId,
      messageId: "", // 아래에서 채움
      title,
      targetDateTime,
      closeDateTime,
      targetRoleId,
      status: "OPEN",
      createdBy: interaction.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 참석/불참 버튼 2개
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:yes`)
        .setLabel("참석")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:no`)
        .setLabel("불참")
        .setStyle(ButtonStyle.Danger)
    );

    const embed = buildSessionEmbed(
      {
        guildId: interaction.guildId!,
        channelId,
        messageId: "",
        title,
        targetDateTime,
        closeDateTime,
        targetRoleId,
        status: "OPEN",
        createdBy: interaction.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { yes: 0, no: 0 }
    );

    const msg = await textChannel.send({
      embeds: [embed],
      components: [row],
    });

    // messageId 업데이트 (마감 시 원본 메시지 수정용)
    await updateSessionMessageId(sessionId, msg.id);

    await interaction.editReply({
      content: `✅ 세션이 생성되었습니다. [공지 메시지](${msg.url})`,
    });
  } catch (err) {
    console.error("[session create]", err);
    await interaction.editReply({
      content: `❌ 세션 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  }
}
