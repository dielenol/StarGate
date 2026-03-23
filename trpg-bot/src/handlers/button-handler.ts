/**
 * 버튼 인터랙션 핸들러
 *
 * 참석/불참 버튼 클릭 시 응답을 저장하고 공지 메시지의 집계를 갱신합니다.
 * customId 형식: trpg:attend:{sessionId}:yes|no
 * @module handlers/button-handler
 */

import type { ButtonInteraction } from "discord.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { findSessionById } from "../db/sessions.js";
import {
  upsertResponse,
  countByStatus,
  findBySessionId,
} from "../db/responses.js";
import { buildSessionEmbed } from "../utils/embed.js";
import type { ResponseStatus } from "../types/session.js";

/** 버튼 customId 접두사 */
const PREFIX = "trpg:attend:";

/**
 * customId에서 sessionId와 status를 파싱합니다.
 * @param customId "trpg:attend:xxx:yes"
 * @returns { sessionId, status } 또는 null
 */
function parseCustomId(customId: string): {
  sessionId: string;
  status: ResponseStatus;
} | null {
  if (!customId.startsWith(PREFIX)) return null;

  const parts = customId.slice(PREFIX.length).split(":");
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
      content: "❌ 해당 세션을 찾을 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  if (session.status !== "OPEN") {
    await interaction.followUp({
      content:
        session.status === "CANCELED"
          ? "❌ 취소된 세션은 응답을 변경할 수 없습니다."
          : "❌ 마감된 세션은 응답을 변경할 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  // 표시명: 서버 닉네임 우선, 없으면 글로벌 유저명
  const displayName =
    (interaction.member as { displayName?: string } | null)?.displayName ??
    interaction.user.username;

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
      .setLabel("참석")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${sessionId}:no`)
      .setLabel("불참")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await interaction.message.edit({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error("[button handler] 메시지 수정 실패:", err);
  }
}
