/**
 * /일정 생성 슬래시 커맨드 핸들러 (서버 관리 권한)
 *
 * 등록 일정 생성, 공지, 가용/불가 버튼을 담당합니다.
 * @module commands/session-create
 */

import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { ATTEND_BUTTON_PREFIX } from "../constants/registrar.js";
import { D, L } from "../constants/registrar-voice.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";
import { requireManageGuild } from "../utils/require-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";
import { safeTitleForAnnouncePing } from "../utils/safe-announce-title.js";
import {
  createSession,
  deleteSessionById,
  updateSessionMessageId,
} from "../db/sessions.js";
import { appendSessionLog } from "../db/logs.js";
import { buildSessionEmbed } from "../utils/embed.js";
const BUTTON_PREFIX = ATTEND_BUTTON_PREFIX;

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
      console.error(L.sessionCreateRollbackDel, announcement.id, err);
    }
  }

  if (!sessionId) return;

  try {
    const deleted = await deleteSessionById(sessionId);
    if (!deleted) {
      console.warn(L.sessionCreateRollbackMiss, sessionId);
    }
  } catch (err) {
    console.error(L.sessionCreateRollbackDb, sessionId, err);
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
      content: D.permManage,
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
      content: D.dateBad,
    });
    return;
  }

  if (closeDateTime >= targetDateTime) {
    await interaction.editReply({
      content: D.closeNotBeforeTarget,
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
      content: D.pastCloseBlock(interpretedClose, yearHint),
    });
    return;
  }

  if (targetDateTime.getTime() <= now) {
    const yearHint =
      targetDateTime.getFullYear() < nowDate.getFullYear()
        ? `\n· **연도** 확인: 배정 일시를 \`${interpretedSession}\`로 읽었는데, 올해는 **${nowDate.getFullYear()}년**입니다.`
        : `\n· 배정 일시를 \`${interpretedSession}\`로 읽었습니다.`;
    await interaction.editReply({
      content: D.targetPast(yearHint),
    });
    return;
  }

  const targetRoleId = extractRoleId(roleOption);
  if (!targetRoleId) {
    await interaction.editReply({
      content: D.roleBad,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({
      content: D.guildOnly,
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
    // DB에 등록 일정 저장 (messageId는 공지 전송 후 업데이트)
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

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:yes`)
        .setLabel("가용")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${BUTTON_PREFIX}${sessionId}:no`)
        .setLabel("불가")
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
      content: D.createChannelAnnounceWithHere(safeTitleForAnnouncePing(title)),
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: ["everyone"] },
    });

    // messageId 업데이트 (마감 시 원본 메시지 수정용)
    const messageIdUpdated = await updateSessionMessageId(
      sessionId,
      announcementMessage.id
    );
    if (!messageIdUpdated) {
      throw new Error(D.createRollbackFail);
    }

    await appendSessionLog(sessionId, "CREATED", {
      userId: interaction.user.id,
      payload: { channelId, messageId: announcementMessage.id },
    });
  } catch (err) {
    await rollbackCreatedSession(sessionId, announcementMessage);
    console.error(L.sessionCreate, err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    const content = missingAccess
      ? D.createMissingAccess
      : D.createErr(
          err instanceof Error ? err.message : "원인 미상"
        );
    await interaction.editReply({ content });
    return;
  }

  await interaction.editReply({
    content: D.createDone(
      announcementMessage.url,
      sessionId!,
      `/${SCHEDULE_ROOT} ${Sub.editDate}`,
      `/${SCHEDULE_ROOT} ${Sub.editClose}`,
      Opt.registrationId
    ),
  });
}
