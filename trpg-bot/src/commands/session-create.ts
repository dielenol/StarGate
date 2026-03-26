/**
 * /일정 생성 슬래시 커맨드 핸들러
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
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";
import { createSession, updateSessionMessageId } from "../db/sessions.js";
import { appendSessionLog } from "../db/logs.js";
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
 * /일정 생성 명령을 처리합니다.
 * @param interaction 슬래시 커맨드 인터랙션
 */
export async function handleSessionCreate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.options.getString(Opt.title, true);
  const dateStr = interaction.options.getString(Opt.date, true);
  const closeStr = interaction.options.getString(Opt.closeTime, true);
  const roleOption = interaction.options.getString(Opt.role, true);
  const channelOption = interaction.options.getString(Opt.channel);

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

  const now = Date.now();
  const nowDate = new Date(now);
  const interpretedClose = closeDateTime.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const interpretedSession = targetDateTime.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // 이미 지난 마감이면 생성 직후 스케줄러가 곧바로 CLOSED 처리함 (오전/오후 혼동 방지)
  if (closeDateTime.getTime() <= now) {
    const yearHint =
      closeDateTime.getFullYear() < nowDate.getFullYear()
        ? "\n· **연도**를 확인해 보세요. 올해가 " +
          `${nowDate.getFullYear()}년이면 \`${closeDateTime.getFullYear()}\`년 날짜는 이미 지난 해입니다.`
        : "";
    await interaction.editReply({
      content:
        "❌ **응답 마감 일시가 이미 지났습니다.** 봇이 세션을 바로 마감해 버립니다.\n" +
        `· 입력한 마감을 **이렇게 해석**했습니다: **${interpretedClose}** (봇이 돌아가는 PC·서버의 **로컬 타임존** 기준)\n` +
        "· **24시간 형식**을 권장합니다. 예: 오후 3시 50분 → `2026-03-18 15:50` (❌ `03:50`은 **새벽** 3시 50분입니다)\n" +
        "· 마감은 **지금 이후**여야 합니다." +
        yearHint,
    });
    return;
  }

  if (targetDateTime.getTime() <= now) {
    const yearHint =
      targetDateTime.getFullYear() < nowDate.getFullYear()
        ? `\n· **연도** 확인: 세션 일시를 \`${interpretedSession}\`로 읽었는데, 올해는 **${nowDate.getFullYear()}년**입니다.`
        : `\n· 세션 일시를 \`${interpretedSession}\`로 읽었습니다.`;
    await interaction.editReply({
      content:
        "❌ 세션 일시는 **현재보다 이후**여야 합니다. (이미 지난 일정은 등록할 수 없습니다.)" +
        yearHint,
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
      { yes: 0, no: 0 },
      undefined,
      undefined,
      sessionId
    );

    const msg = await textChannel.send({
      embeds: [embed],
      components: [row],
    });

    // messageId 업데이트 (마감 시 원본 메시지 수정용)
    await updateSessionMessageId(sessionId, msg.id);

    await appendSessionLog(sessionId, "CREATED", {
      userId: interaction.user.id,
      payload: { channelId, messageId: msg.id },
    });

    await interaction.editReply({
      content: [
        `✅ 세션이 생성되었습니다. [공지 메시지](${msg.url})`,
        "",
        `공지 임베드에도 **세션 ID**가 표시됩니다. (복사: \`${sessionId}\`)`,
        `일정 변경: **\`/${SCHEDULE_ROOT} ${Sub.editDate}\`**(세션 일시), **\`/${SCHEDULE_ROOT} ${Sub.editClose}\`**(응답 마감)`,
        `_\`${Opt.sessionId}\`를 비우면 서버 기준 가장 최근 진행 중 세션이 자동 선택됩니다._`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[session create]", err);
    await interaction.editReply({
      content: `❌ 세션 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  }
}
