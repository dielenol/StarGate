/**
 * 세션 마감·취소 공통 처리
 *
 * 스케줄러·강제 마감·취소에서 재사용합니다.
 * @module services/session-close
 */

import type { Client } from "discord.js";
import {
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { updateSessionStatus } from "../db/sessions.js";
import { findBySessionId, countByStatus } from "../db/responses.js";
import { buildSessionEmbed, buildResultEmbed } from "../utils/embed.js";
import { getNonResponders } from "../utils/no-response.js";
import { fetchGuildMembersCached } from "../utils/guild-members.js";
import { appendSessionLog } from "../db/logs.js";
import type { Session } from "../types/session.js";

const PREFIX = "trpg:attend:";
const EMBED_COLOR = 0xc5a059;

/**
 * 정상 마감(스케줄 또는 강제): 집계·공지 수정·결과 메시지·로그
 */
export async function executeSessionClose(
  client: Client,
  session: Session,
  options: { kind: "scheduled" | "force"; actorUserId?: string }
): Promise<void> {
  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const sid = String(session._id);
  const members = await fetchGuildMembersCached(guild);

  await updateSessionStatus(sid, "CLOSED");

  const responses = await findBySessionId(sid);
  const counts = await countByStatus(sid);

  const noResponseIds = await getNonResponders(
    guild,
    session.targetRoleId,
    responses,
    members
  );
  const yesIds = responses
    .filter((r) => r.status === "YES")
    .map((r) => r.userId);
  const noIds = responses
    .filter((r) => r.status === "NO")
    .map((r) => r.userId);

  try {
    const msg = await channel.messages.fetch(session.messageId);
    const sid =
      session._id !== undefined && session._id !== null
        ? String(session._id)
        : undefined;
    const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid);
    embed.setFooter({ text: "마감되었습니다." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:yes`)
        .setLabel("참석")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:no`)
        .setLabel("불참")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error("[session-close] 공지 메시지 수정 실패:", err);
  }

  const resultEmbed = buildResultEmbed(session, yesIds, noIds, noResponseIds);
  await (channel as TextChannel).send({ embeds: [resultEmbed] });

  await appendSessionLog(sid, options.kind === "force" ? "FORCE_CLOSED" : "CLOSED", {
    userId: options.actorUserId,
    payload: { kind: options.kind },
  });
}

/**
 * 세션 취소: 버튼 비활성화·안내 임베드·로그 (결과 집계 메시지 없음)
 */
export async function executeSessionCancel(
  client: Client,
  session: Session,
  actorUserId: string
): Promise<void> {
  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const sid = String(session._id);
  await updateSessionStatus(sid, "CANCELED");

  try {
    const msg = await channel.messages.fetch(session.messageId);
    const cancelEmbed = new EmbedBuilder()
      .setTitle(`❌ 취소됨 — ${session.title}`)
      .setColor(EMBED_COLOR)
      .setDescription("이 세션 참여 체크는 관리자에 의해 취소되었습니다.")
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:yes`)
        .setLabel("참석")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}${sid}:no`)
        .setLabel("불참")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

    await msg.edit({ embeds: [cancelEmbed], components: [row] });
  } catch (err) {
    console.error("[session-close] 취소 시 메시지 수정 실패:", err);
  }

  await appendSessionLog(sid, "CANCELED", {
    userId: actorUserId,
  });
}
