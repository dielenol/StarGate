/**
 * /일정 생성 슬래시 커맨드 핸들러 (서버 관리 권한)
 *
 * 세션 생성, DB 저장, 공지 메시지 전송, 참석/불참/미정 버튼 렌더링을 담당합니다.
 * @module commands/session-create
 */

import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";
import { requireManageGuild } from "../utils/require-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";
import {
  createSession,
  deleteSessionById,
  updateSessionMessageId,
} from "../db/sessions.js";
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

async function rollbackCreatedSession(
  sessionId: string | null,
  announcement:
    | {
        id: string;
        delete: () => Promise<unknown>;
      }
    | null
): Promise<void> {
  if (announcement) {
    try {
      await announcement.delete();
    } catch (err) {
      console.error(
        "[session create] 롤백 중 공지 메시지 삭제 실패:",
        announcement.id,
        err
      );
    }
  }

  if (!sessionId) return;

  try {
    const deleted = await deleteSessionById(sessionId);
    if (!deleted) {
      console.warn(
        "[session create] 롤백 대상 세션을 찾지 못했습니다:",
        sessionId
      );
    }
  } catch (err) {
    console.error("[session create] 롤백 중 세션 삭제 실패:", sessionId, err);
  }
}

/**
 * /일정 생성 명령을 처리합니다.
 * @param interaction 슬래시 커맨드 인터랙션
 */
export async function handleSessionCreate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const title = interaction.options.getString(Opt.title, true);
  const dateStr = interaction.options.getString(Opt.date, true);
  const closeStr = interaction.options.getString(Opt.closeTime, true);
  const roleOption = interaction.options.getString(Opt.role, true);
  const channelFromOpt = interaction.options.getChannel(Opt.channel);

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

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
    });
    return;
  }

  const resolvedChannel = await resolveGuildTextSendChannel(
    guild,
    channelFromOpt,
    interaction.channelId
  );
  if (!resolvedChannel.ok) {
    await interaction.editReply({ content: resolvedChannel.message });
    return;
  }

  const textChannel = resolvedChannel.channel;
  const channelId = textChannel.id;

  let sessionId: string | null = null;
  let announcementMessage:
    | {
        id: string;
        url: string;
        delete: () => Promise<unknown>;
      }
    | null = null;

  try {
    // DB에 세션 저장 (messageId는 공지 전송 후 업데이트)
    sessionId = await createSession({
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

    announcementMessage = await textChannel.send({
      embeds: [embed],
      components: [row],
    });

    // messageId 업데이트 (마감 시 원본 메시지 수정용)
    const messageIdUpdated = await updateSessionMessageId(
      sessionId,
      announcementMessage.id
    );
    if (!messageIdUpdated) {
      throw new Error("세션 공지 messageId 저장에 실패했습니다.");
    }

    await appendSessionLog(sessionId, "CREATED", {
      userId: interaction.user.id,
      payload: { channelId, messageId: announcementMessage.id },
    });
  } catch (err) {
    await rollbackCreatedSession(sessionId, announcementMessage);
    console.error("[session create]", err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    const content = missingAccess
      ? "❌ 봇이 **공지 채널**에 메시지를 보낼 수 없습니다. (Discord `Missing Access`)\n" +
        "· 채널·카테고리 권한에서 봇 역할에 **채널 보기**, **메시지 보내기**, **링크 임베드**를 허용했는지 확인하세요.\n" +
        "· **스레드**면 **스레드에서 메시지 보내기**가 필요하고, 비공개 스레드는 봇을 스레드에 **초대**해야 할 수 있습니다."
      : `❌ 세션 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`;
    await interaction.editReply({ content });
    return;
  }

  await interaction.editReply({
    content: [
      `✅ 세션이 생성되었습니다. [공지 메시지](${announcementMessage.url})`,
      "",
      `공지 임베드에도 **세션 ID**가 표시됩니다. (복사: \`${sessionId}\`)`,
      `일정 변경: **\`/${SCHEDULE_ROOT} ${Sub.editDate}\`**(세션 일시), **\`/${SCHEDULE_ROOT} ${Sub.editClose}\`**(응답 마감)`,
      `_\`${Opt.sessionId}\`를 비우면 서버 기준 가장 최근 진행 중 세션이 자동 선택됩니다._`,
    ].join("\n"),
  });
}
