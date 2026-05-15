/**
 * trpg-web 세션 생성/리마인드/취소 DM 메시지 빌더
 *
 * @module utils/trpg-session-message
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";

import type { BaseMessageOptions } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

const CREATION_COLOR = 0xc5a059;
const REMINDER_COLOR = 0x5f8dd3;
const CANCELLATION_COLOR = 0xd15f5f;
const STAR_GATE_FOOTER = "다채로운 TRPG Calendar";
const EMBED_FIELD_VALUE_MAX = 1024;

type TrpgSessionDmKind =
  | "creation"
  | "reminder24h"
  | "update"
  | "cancellation";

type BuildTrpgSessionDmOptions = {
  kind: TrpgSessionDmKind;
  session: TrpgSession;
  sessionId: string;
  baseUrl: string;
};

function sessionDateTimeToUnix(date: string, startTime: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!dateMatch || !timeMatch) return null;

  const [, y, m, d] = dateMatch;
  const [, hh, mm] = timeMatch;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  // 입력값은 KST 기준이므로 UTC epoch 로 변환한다.
  return Math.floor(
    Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0) / 1000,
  );
}

function formatSessionDateTime(session: TrpgSession): string {
  const fixed = `${session.date} ${session.startTime} (KST)`;
  const unix = sessionDateTimeToUnix(session.date, session.startTime);
  if (unix === null) return fixed;

  return `${fixed}\n<t:${unix}:F> · <t:${unix}:R>`;
}

function compactUrlBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function formatParticipantMentions(userIds: string[]): string {
  if (userIds.length === 0) return "0명";

  const mentions = userIds.map((id) => `<@${id}>`).join(" ");
  const value = `${userIds.length}명 - ${mentions}`;
  return value.length > EMBED_FIELD_VALUE_MAX
    ? `${value.slice(0, EMBED_FIELD_VALUE_MAX - 3)}...`
    : value;
}

export function buildTrpgSessionDmMessage({
  kind,
  session,
  sessionId,
  baseUrl,
}: BuildTrpgSessionDmOptions): BaseMessageOptions {
  const normalizedBaseUrl = compactUrlBase(baseUrl);
  const calendarUrl = `${normalizedBaseUrl}/calendar`;

  const isReminder = kind === "reminder24h";
  const isUpdate = kind === "update";
  const isCancellation = kind === "cancellation";
  const color = isCancellation
    ? CANCELLATION_COLOR
    : isReminder
      ? REMINDER_COLOR
      : CREATION_COLOR;
  const title = isCancellation
    ? "다음 TRPG 세션이 취소되었습니다"
    : isReminder
      ? "내일 TRPG 세션이 시작됩니다"
      : isUpdate
        ? "다음 TRPG 세션이 수정되었습니다"
      : "다음 TRPG 세션이 열렸습니다";
  const description = isCancellation
    ? "아래 버튼을 눌러 캘린더에서 변경된 일정을 확인할 수 있습니다."
    : isReminder
      ? "일정이 가까워졌습니다. 상세 내용을 한 번 더 확인해 주세요."
      : isUpdate
        ? "세션 정보가 변경되었습니다. 아래 내용을 확인해 주세요."
      : "아래 버튼을 눌러 상세 내용을 확인할 수 있습니다.";
  const actionUrl = isCancellation
    ? `${calendarUrl}?date=${encodeURIComponent(session.date)}`
    : `${calendarUrl}?sessionId=${encodeURIComponent(sessionId)}`;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      {
        name: "세션 제목",
        value: `**${session.title}**`,
        inline: false,
      },
      {
        name: "일시",
        value: formatSessionDateTime(session),
        inline: false,
      },
      {
        name: "마스터",
        value: session.createdByUsername,
        inline: true,
      },
      {
        name: "세션 참가 인원",
        value: formatParticipantMentions(session.participantDiscordIds),
        inline: false,
      },
    )
    .setFooter({ text: STAR_GATE_FOOTER })
    .setTimestamp(
      isReminder || isUpdate || isCancellation ? new Date() : session.createdAt,
    );

  if (isUpdate && session.updateNotificationChanges?.length) {
    embed.addFields({
      name: "변경 내용",
      value: session.updateNotificationChanges.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("캘린더에서 확인")
      .setStyle(ButtonStyle.Link)
      .setURL(actionUrl),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}
