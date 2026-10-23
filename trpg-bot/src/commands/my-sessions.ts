/**
 * `/내세션` 슬래시 핸들러
 *
 * 내가 참가하거나 마스터로 진행하는 다가오는(KST 오늘 이후) open 세션을 일시순으로
 * 비공개 응답한다. 세션마다 trpg-web 세션 상세로 바로 가는 링크 버튼을 붙인다.
 * 읽기 전용 — 세션 생성·수정·참가 변경은 trpg-web 에서 한다.
 *
 * @module commands/my-sessions
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { findUpcomingTrpgSessionsForParticipant } from "@stargate/shared-db";

import type { ChatInputCommandInteraction } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { MY_SESSIONS_LIMIT_OPTION } from "../slash/ko-names.js";
import {
  formatKstMonthDayWeekday,
  kstDateKey,
  kstDateTimeToUnix,
  nowKstYmd,
} from "../utils/kst.js";

const MY_SESSIONS_COLOR = 0xc5a059;
const DEFAULT_LIMIT = 5;
export const MAX_MY_SESSIONS = 10;
const BUTTONS_PER_ROW = 5;
const BUTTON_LABEL_MAX = 80;
const FIELD_NAME_MAX = 256;

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sessionWhen(session: TrpgSession): string {
  const unix = kstDateTimeToUnix(session.date, session.startTime);
  return unix === null
    ? `${session.date} ${session.startTime} (KST)`
    : `<t:${unix}:F> · <t:${unix}:R>`;
}

/** 테스트와 실제 응답이 공유하는 `/내세션` 응답 본문. */
export function buildMySessionsResponse({
  sessions,
  userId,
  baseUrl,
}: {
  sessions: TrpgSession[];
  userId: string;
  baseUrl: string;
}) {
  const calendarUrl = `${baseUrl}/calendar`;
  if (sessions.length === 0) {
    return {
      content:
        "오늘 이후 내가 참가하거나 진행하는 세션이 없습니다. 웹 캘린더에서 전체 일정을 확인할 수 있습니다.",
      embeds: [],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("웹 캘린더 열기")
            .setStyle(ButtonStyle.Link)
            .setURL(calendarUrl),
        ),
      ],
    };
  }

  const embed = new EmbedBuilder()
    .setColor(MY_SESSIONS_COLOR)
    .setTitle("📅 내 다가오는 세션")
    .setDescription(`오늘 이후 일정 ${sessions.length}건을 시작 시각 순으로 보여 줍니다.`)
    .setFooter({ text: "이 목록은 나에게만 표시됩니다 · 다채로운 TRPG Calendar" });

  const buttons: ButtonBuilder[] = [];
  for (const [index, session] of sessions.entries()) {
    const role =
      session.createdByDiscordId === userId ? " · 내가 진행" : "";
    embed.addFields({
      name: truncate(
        `${index + 1}. ${formatKstMonthDayWeekday(session.date)} ${session.startTime} · ${session.title}`,
        FIELD_NAME_MAX,
      ),
      value: [
        `\`일시\` ${sessionWhen(session)}`,
        `\`마스터\` ${session.createdByUsername}${role}`,
        `\`참가\` ${session.participantDiscordIds.length}명`,
      ].join("\n"),
      inline: false,
    });
    const sessionId = session._id?.toString();
    if (sessionId) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(truncate(`${index + 1}. ${session.title}`, BUTTON_LABEL_MAX))
          .setStyle(ButtonStyle.Link)
          .setURL(`${calendarUrl}?sessionId=${encodeURIComponent(sessionId)}`),
      );
    }
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < buttons.length; start += BUTTONS_PER_ROW) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.slice(start, start + BUTTONS_PER_ROW),
      ),
    );
  }

  return { content: "", embeds: [embed], components };
}

export async function handleMySessions(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild() || interaction.guildId !== config.trpgGuildId) {
    await interaction.reply({
      content: "이 서버에서는 `/내세션` 명령을 사용할 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const limit = Math.min(
    MAX_MY_SESSIONS,
    Math.max(
      1,
      interaction.options.getInteger(MY_SESSIONS_LIMIT_OPTION) ?? DEFAULT_LIMIT,
    ),
  );
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessions = await findUpcomingTrpgSessionsForParticipant(
    config.trpgGuildId,
    interaction.user.id,
    kstDateKey(nowKstYmd()),
    limit,
  );
  await interaction.editReply({
    ...buildMySessionsResponse({
      sessions,
      userId: interaction.user.id,
      baseUrl: config.trpgWebBaseUrl,
    }),
    allowedMentions: { parse: [] },
  });
}
