/**
 * `/세션확인` 슬래시 핸들러
 *
 * 이번 달 trpg_sessions 를 PNG 캘린더 + 상세 embed 로 렌더하고,
 * trpg-web 캘린더 URL 버튼을 첨부해 서버에 공개 응답한다 (ephemeral 아님).
 *
 * @module commands/trpg-session-check
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { findTrpgSessionsByMonth } from "@stargate/shared-db";

import type { ChatInputCommandInteraction } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { nowKstYmd } from "../utils/kst.js";
import { renderTrpgCalendarPng } from "../utils/trpg-calendar-image.js";

const CALENDAR_EMBED_COLOR = 0xc5a059;
const CALENDAR_FOOTER = "다채로운 TRPG Calendar";
const EMBED_FIELD_VALUE_MAX = 1024;
const MAX_LISTED_SESSIONS = 12;
const MAX_PARTICIPANT_MENTIONS = 16;

type SessionCheckMode = "detail" | "summary";

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

  return Math.floor(
    Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0) / 1000,
  );
}

function formatParticipantMentions(userIds: string[]): string {
  if (userIds.length === 0) return "0명";

  const listed = userIds.slice(0, MAX_PARTICIPANT_MENTIONS);
  const rest = userIds.length - listed.length;
  const suffix = rest > 0 ? ` 외 ${rest}명` : "";
  return `${userIds.length}명 - ${listed.map((id) => `<@${id}>`).join(" ")}${suffix}`;
}

function formatSessionBlock(session: TrpgSession): string {
  const unix = sessionDateTimeToUnix(session.date, session.startTime);
  const when =
    unix === null
      ? `${session.date} ${session.startTime} (KST)`
      : `<t:${unix}:F> · <t:${unix}:R>`;
  return [
    `**${session.title}**`,
    `일시: ${when}`,
    `마스터: ${session.createdByUsername}`,
    `참가: ${formatParticipantMentions(session.participantDiscordIds)}`,
  ].join("\n");
}

function buildSessionFields(sessions: TrpgSession[]) {
  if (sessions.length === 0) {
    return [
      {
        name: "세션 목록",
        value: "이번 달에 등록된 세션이 없습니다.",
        inline: false,
      },
    ];
  }

  const listed = sessions.slice(0, MAX_LISTED_SESSIONS);
  const fields: { name: string; value: string; inline: false }[] = [];
  let current = "";

  for (const session of listed) {
    const block = formatSessionBlock(session);
    const next = current.length === 0 ? block : `${current}\n\n${block}`;
    if (next.length > EMBED_FIELD_VALUE_MAX && current.length > 0) {
      fields.push({
        name: fields.length === 0 ? "세션 목록" : `세션 목록 ${fields.length + 1}`,
        value: current,
        inline: false,
      });
      current = block;
    } else {
      current = next;
    }
  }

  const rest = sessions.length - listed.length;
  if (rest > 0) {
    const restLine = `외 ${rest}건은 웹 캘린더에서 확인할 수 있습니다.`;
    const next = current.length === 0 ? restLine : `${current}\n\n${restLine}`;
    if (next.length > EMBED_FIELD_VALUE_MAX && current.length > 0) {
      fields.push({
        name: fields.length === 0 ? "세션 목록" : `세션 목록 ${fields.length + 1}`,
        value: current,
        inline: false,
      });
      current = restLine;
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    fields.push({
      name: fields.length === 0 ? "세션 목록" : `세션 목록 ${fields.length + 1}`,
      value: current,
      inline: false,
    });
  }

  return fields;
}

function buildMonthlySummary(sessions: TrpgSession[], todayKey: string): string {
  const todayCount = sessions.filter((s) => s.date === todayKey).length;
  const upcomingCount = sessions.filter((s) => s.date >= todayKey).length;
  const participantTotal = sessions.reduce(
    (sum, s) => sum + s.participantDiscordIds.length,
    0,
  );

  return [
    `총 세션: **${sessions.length}건**`,
    `오늘 일정: **${todayCount}건**`,
    `예정 일정: **${upcomingCount}건**`,
    `참가 대상 누적: **${participantTotal}명**`,
  ].join("\n");
}

function buildCalendarResponse({
  year,
  month,
  sessions,
  webUrl,
  hasImage,
  todayKey,
  mode,
}: {
  year: number;
  month: number;
  sessions: TrpgSession[];
  webUrl: string;
  hasImage: boolean;
  todayKey: string;
  mode: SessionCheckMode;
}) {
  const title = `${year}년 ${month}월 TRPG 세션`;
  const description =
    sessions.length === 0
      ? "등록된 세션이 없습니다. 새 일정이 생기면 이곳에 표시됩니다."
      : `이번 달 등록된 세션은 총 ${sessions.length}건입니다.`;

  const embed = new EmbedBuilder()
    .setColor(CALENDAR_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      {
        name: "월간 요약",
        value: buildMonthlySummary(sessions, todayKey),
        inline: false,
      },
    )
    .setFooter({ text: CALENDAR_FOOTER })
    .setTimestamp();

  if (mode === "detail") {
    embed.addFields(...buildSessionFields(sessions));
  }

  if (hasImage) {
    embed.setImage("attachment://trpg-calendar.png");
  } else {
    embed.addFields({
      name: "캘린더 이미지",
      value: "현재 환경에서는 PNG 캘린더를 생성하지 못했습니다.",
      inline: false,
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("웹 캘린더 열기")
      .setStyle(ButtonStyle.Link)
      .setURL(webUrl),
  );

  return { embeds: [embed], components: [row] };
}

export async function handleTrpgSessionCheck(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // 길드 외부 호출 차단 (DM 등)
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "이 명령어는 길드 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 운영 분리 약속에 따라 trpgGuildId 외 길드에서의 호출 차단
  if (interaction.guildId !== config.trpgGuildId) {
    await interaction.reply({
      content: "이 길드에서는 `/세션확인` 명령을 사용할 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const privateReply = interaction.options.getBoolean("비공개") ?? false;
  await interaction.deferReply(
    privateReply ? { flags: MessageFlags.Ephemeral } : {},
  );

  const now = nowKstYmd();
  const year = interaction.options.getInteger("연도") ?? now.year;
  const month = interaction.options.getInteger("월") ?? now.month;
  const mode =
    interaction.options.getString("모드") === "summary" ? "summary" : "detail";
  const todayKey = `${now.year}-${String(now.month).padStart(2, "0")}-${String(
    now.day,
  ).padStart(2, "0")}`;
  const todayDay = year === now.year && month === now.month ? now.day : null;

  try {
    const sessions = await findTrpgSessionsByMonth(
      config.trpgGuildId,
      year,
      month,
    );

    const baseUrl = config.trpgWebBaseUrl;
    const webUrl = `${baseUrl}/calendar`;

    const png = await renderTrpgCalendarPng({
      year,
      month,
      sessions,
      todayDay,
    });

    if (!png) {
      await interaction.editReply({
        ...buildCalendarResponse({
          year,
          month,
          sessions,
          webUrl,
          hasImage: false,
          todayKey,
          mode,
        }),
      });
      return;
    }

    const attachment = new AttachmentBuilder(png, {
      name: "trpg-calendar.png",
    });

    await interaction.editReply({
      ...buildCalendarResponse({
        year,
        month,
        sessions,
        webUrl,
        hasImage: true,
        todayKey,
        mode,
      }),
      files: [attachment],
    });
  } catch (err) {
    console.error("[trpg-session-check] 처리 실패:", err);
    if (interaction.deferred || interaction.replied) {
      await interaction
        .editReply({
          content: "세션 일정을 가져오는 중 오류가 발생했습니다.",
        })
        .catch(() => {});
    }
  }
}
