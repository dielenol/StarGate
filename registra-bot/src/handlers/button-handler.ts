/**
 * 버튼 인터랙션 핸들러
 *
 * 가용/불가 버튼 클릭 시 응답을 저장하고 공지 임베드 집계를 갱신합니다.
 * customId 형식: registrar:attend:{sessionId}:yes|no
 * @module handlers/button-handler
 */

import type { ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { ATTEND_BUTTON_PREFIX } from "../constants/registrar.js";
import { D, L } from "../constants/registrar-voice.js";
import { findSessionById } from "../db/sessions.js";
import {
  upsertResponse,
  countByStatus,
  findBySessionId,
} from "../db/responses.js";
import {
  hasParticipationCheckTipBeenShown,
  recordParticipationCheckTipShown,
} from "../db/registrar-user-tips.js";
import { appendSessionLog, upsertDiscordUser } from "@stargate/shared-db";
import { buildSessionEmbed } from "../utils/embed.js";
import type { ResponseStatus } from "../types/session.js";

const PREFIX = ATTEND_BUTTON_PREFIX;

/**
 * customId에서 sessionId와 status를 파싱합니다.
 * @param customId "registrar:attend:xxx:yes"
 * @returns { sessionId, status } 또는 null
 */
function parseCustomId(customId: string): {
  sessionId: string;
  status: ResponseStatus;
} | null {
  if (!customId.startsWith(ATTEND_BUTTON_PREFIX)) return null;

  const parts = customId.slice(ATTEND_BUTTON_PREFIX.length).split(":");
  if (parts.length !== 2) return null;

  const [sessionId, status] = parts;
  if (!["yes", "no"].includes(status)) return null;

  return {
    sessionId,
    status: status.toUpperCase() as ResponseStatus,
  };
}

/**
 * 버튼 인터랙션을 처리합니다.
 * @param interaction 버튼 클릭 인터랙션
 */
export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const { sessionId, status } = parsed;

  await interaction.deferUpdate();

  const session = await findSessionById(sessionId);
  if (!session) {
    await interaction.followUp({
      content: D.btnNoRecord,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  if (session.status !== "OPEN") {
    await interaction.followUp({
      content:
        session.status === "CANCELING"
          ? D.btnCanceling
          : session.status === "CANCELED"
            ? D.btnCanceled
            : session.status === "CLOSING"
              ? D.btnClosing
              : D.btnClosed,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  // 표시명: 서버 닉네임 우선, 없으면 글로벌 유저명
  const displayName =
    (interaction.member as { displayName?: string } | null)?.displayName ??
    interaction.user.username;

  // Discord 유저를 통합 users 컬렉션에 upsert (미등록은 U(미분류) 자동 생성)
  // 실패해도 응답 저장은 계속 진행 (핵심 흐름 보호)
  try {
    await upsertDiscordUser({
      discordId: interaction.user.id,
      discordUsername: interaction.user.username,
      discordGlobalName: interaction.user.globalName ?? null,
      discordAvatar: interaction.user.avatar
        ? `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}.png`
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upsertDiscordUser] failed:", err);
    // 운영자 관측성: session_logs에 실패 기록
    void appendSessionLog(sessionId, "CREATED", {
      userId: interaction.user.id,
      payload: {
        kind: "USER_UPSERT_FAILED",
        error: message,
      },
    }).catch((logErr) => {
      console.error("[appendSessionLog:USER_UPSERT_FAILED] failed:", logErr);
    });
  }

  // 응답 저장 (1인 1상태, 덮어쓰기)
  await upsertResponse(sessionId, interaction.user.id, status, displayName);

  // 집계 수 및 명단 갱신 (멘션 형식)
  const counts = await countByStatus(sessionId);
  const responses = await findBySessionId(sessionId);
  const yesIds = responses.filter((r) => r.status === "YES").map((r) => r.userId);
  const noIds = responses.filter((r) => r.status === "NO").map((r) => r.userId);
  const sid =
    session._id !== undefined && session._id !== null
      ? String(session._id)
      : undefined;
  const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid);

  // 버튼은 그대로 유지 (마감 전에는 비활성화 안 함)
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${sessionId}:yes`)
      .setLabel("가용")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${sessionId}:no`)
      .setLabel("불가")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await interaction.message.edit({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error(L.btnEdit, err);
  }

  if (status === "YES" && interaction.guildId) {
    try {
      const shown = await hasParticipationCheckTipBeenShown(
        interaction.guildId,
        interaction.user.id
      );
      if (!shown) {
        await interaction.followUp({
          content: D.btnYesParticipationTipOnce,
          flags: MessageFlags.Ephemeral,
        });
        await recordParticipationCheckTipShown(
          interaction.guildId,
          interaction.user.id
        );
      }
    } catch (err) {
      console.error(L.btnParticipationTip, err);
    }
  }
}
