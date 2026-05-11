/**
 * `/세션확인` 슬래시 핸들러
 *
 * 이번 달 trpg_sessions 를 PNG 캘린더로 렌더하고, trpg-web 캘린더 URL 을
 * content 로 첨부해 서버에 공개 응답한다 (ephemeral 아님).
 *
 * @module commands/trpg-session-check
 */

import { AttachmentBuilder, MessageFlags } from "discord.js";
import { findTrpgSessionsByMonth } from "@stargate/shared-db";

import type { ChatInputCommandInteraction } from "discord.js";

import { config } from "../config.js";
import { nowKstYmd } from "../utils/kst.js";
import { renderTrpgCalendarPng } from "../utils/trpg-calendar-image.js";

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

  await interaction.deferReply();

  const { year, month, day } = nowKstYmd();

  try {
    const sessions = await findTrpgSessionsByMonth(
      config.trpgGuildId,
      year,
      month,
    );

    const baseUrl = config.trpgWebBaseUrl;
    const webUrl = `${baseUrl}/calendar`;
    const summary =
      sessions.length === 0
        ? `${year}년 ${month}월에 등록된 TRPG 세션이 없습니다.`
        : `${year}년 ${month}월 TRPG 세션 ${sessions.length}건`;

    const png = await renderTrpgCalendarPng({
      year,
      month,
      sessions,
      todayDay: day,
    });

    if (!png) {
      // PNG 비활성 또는 렌더 실패 — 텍스트만 응답
      await interaction.editReply({
        content: `${summary}\n웹 캘린더: ${webUrl}`,
      });
      return;
    }

    const attachment = new AttachmentBuilder(png, {
      name: "trpg-calendar.png",
    });

    await interaction.editReply({
      content: `${summary}\n웹 캘린더: ${webUrl}`,
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
