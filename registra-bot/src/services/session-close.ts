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
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { updateSessionStatusIfCurrent } from "../db/sessions.js";
import { findBySessionId, countByStatus } from "../db/responses.js";
import {
  buildSessionEmbed,
  buildResultEmbed,
} from "../utils/embed.js";
import { getNonResponders } from "../utils/no-response.js";
import { fetchGuildMembersCached } from "../utils/guild-members.js";
import { appendSessionLog } from "../db/logs.js";
import { buildSessionResultCardBuffer } from "../utils/build-session-result-card.js";
import type { Session } from "../types/session.js";

const PREFIX = "trpg:attend:";
const EMBED_COLOR = 0xc5a059;

export type SessionFinalizeResult = {
  transitioned: boolean;
  warnings: string[];
};

/**
 * 정상 마감(스케줄 또는 강제): 집계·공지 수정·결과 메시지·로그
 */
export async function executeSessionClose(
  client: Client,
  session: Session,
  options: { kind: "scheduled" | "force"; actorUserId?: string }
): Promise<SessionFinalizeResult> {
  const warnings: string[] = [];
  if (session._id === undefined || session._id === null) {
    console.error("[session-close] 세션 _id 없음 — 마감 처리를 건너뜁니다.");
    warnings.push("세션 ID가 없어 마감 처리를 건너뛰었습니다.");
    return { transitioned: false, warnings };
  }
  const sid = String(session._id);

  const transitioned = await updateSessionStatusIfCurrent(sid, "OPEN", "CLOSED");
  if (!transitioned) {
    return { transitioned: false, warnings };
  }

  const closedSession: Session = {
    ...session,
    status: "CLOSED",
    updatedAt: new Date(),
  };

  try {
    const guild = await client.guilds.fetch(closedSession.guildId);
    const channel = await guild.channels.fetch(closedSession.channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
      warnings.push("공지 채널에 접근할 수 없어 결과 메시지를 보내지 못했습니다.");
    } else {
      const members = await fetchGuildMembersCached(guild);
      const responses = await findBySessionId(sid);
      const counts = await countByStatus(sid);

      const noResponseIds = await getNonResponders(
        guild,
        closedSession.targetRoleId,
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
        const msg = await channel.messages.fetch(closedSession.messageId);
        const embed = buildSessionEmbed(
          closedSession,
          counts,
          yesIds,
          noIds,
          sid
        );
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
        warnings.push("기존 공지 메시지 수정에 실패했습니다.");
        console.error("[session-close] 공지 메시지 수정 실패:", err);
      }

      try {
        const resultEmbed = buildResultEmbed(
          closedSession,
          yesIds,
          noIds,
          noResponseIds
        );

        const cardPng = await buildSessionResultCardBuffer({
          session: closedSession,
          guildId: closedSession.guildId,
          members,
          responses,
          yesIds,
          noIds,
          noResponseIds,
          cardMode: "closed",
        });

        const files =
          cardPng !== null
            ? [new AttachmentBuilder(cardPng, { name: "session-result.png" })]
            : undefined;

        await (channel as TextChannel).send({ embeds: [resultEmbed], files });
      } catch (err) {
        warnings.push("최종 결과 메시지 전송에 실패했습니다.");
        console.error("[session-close] 결과 메시지 전송 실패:", err);
      }
    }
  } catch (err) {
    warnings.push("Discord 후속 처리 중 오류가 발생했습니다.");
    console.error("[session-close] 마감 후속 처리 실패:", err);
  }

  try {
    await appendSessionLog(
      sid,
      options.kind === "force" ? "FORCE_CLOSED" : "CLOSED",
      {
        userId: options.actorUserId,
        payload: { kind: options.kind, warnings },
      }
    );
  } catch (err) {
    warnings.push("운영 로그 저장에 실패했습니다.");
    console.error("[session-close] 운영 로그 저장 실패:", err);
  }

  return { transitioned: true, warnings };
}

/**
 * 세션 취소: 버튼 비활성화·안내 임베드·로그 (결과 집계 메시지 없음)
 */
export async function executeSessionCancel(
  client: Client,
  session: Session,
  actorUserId: string
): Promise<SessionFinalizeResult> {
  const warnings: string[] = [];
  const sid = String(session._id);
  const transitioned = await updateSessionStatusIfCurrent(
    sid,
    "OPEN",
    "CANCELED"
  );
  if (!transitioned) {
    return { transitioned: false, warnings };
  }

  const canceledSession: Session = {
    ...session,
    status: "CANCELED",
    updatedAt: new Date(),
  };

  try {
    const guild = await client.guilds.fetch(canceledSession.guildId);
    const channel = await guild.channels.fetch(canceledSession.channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
      warnings.push("공지 채널에 접근할 수 없어 취소 공지를 갱신하지 못했습니다.");
    } else {
      try {
        const msg = await channel.messages.fetch(canceledSession.messageId);
        const cancelEmbed = new EmbedBuilder()
          .setTitle(`❌ 취소됨 — ${canceledSession.title}`)
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
        warnings.push("기존 공지 메시지 수정에 실패했습니다.");
        console.error("[session-close] 취소 시 메시지 수정 실패:", err);
      }
    }
  } catch (err) {
    warnings.push("Discord 후속 처리 중 오류가 발생했습니다.");
    console.error("[session-close] 취소 후속 처리 실패:", err);
  }

  try {
    await appendSessionLog(sid, "CANCELED", {
      userId: actorUserId,
      payload: { warnings },
    });
  } catch (err) {
    warnings.push("운영 로그 저장에 실패했습니다.");
    console.error("[session-close] 취소 로그 저장 실패:", err);
  }

  return { transitioned: true, warnings };
}
