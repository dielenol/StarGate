/**
 * 등록 일정 마감·취소 공통 처리
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
import {
  ATTEND_BUTTON_PREFIX,
  EMBED_FOOTER_ANNOUNCE_CLOSED,
  REGISTRAR_SIGNATURE,
} from "../constants/registrar.js";
import { CancelEmbed, D, L, W } from "../constants/registrar-voice.js";
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
import { safeTitleForAnnouncePing } from "../utils/safe-announce-title.js";
import type { Session } from "../types/session.js";

const PREFIX = ATTEND_BUTTON_PREFIX;
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
    console.error(L.sessionCloseNoId);
    warnings.push(W.noIdSkip);
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
      warnings.push(W.channelInaccessible);
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
        embed.setFooter({
          text: `${EMBED_FOOTER_ANNOUNCE_CLOSED}\n— ${REGISTRAR_SIGNATURE}`,
        });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}${sid}:yes`)
            .setLabel("가용")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`${PREFIX}${sid}:no`)
            .setLabel("불가")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await msg.edit({ embeds: [embed], components: [row] });
      } catch (err) {
        warnings.push(W.announceEditFail);
        console.error(L.sessionCloseAnnounceEdit, err);
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

        await (channel as TextChannel).send({
          content: D.closeChannelAnnounceWithHere(
            options.kind,
            safeTitleForAnnouncePing(closedSession.title)
          ),
          embeds: [resultEmbed],
          files,
          allowedMentions: { parse: ["everyone"] },
        });
      } catch (err) {
        warnings.push(W.resultSendFail);
        console.error(L.sessionCloseResultSend, err);
      }
    }
  } catch (err) {
    warnings.push(W.discordErr);
    console.error(L.sessionCloseFollowup, err);
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
    warnings.push(W.logFail);
    console.error(L.sessionCloseLog, err);
  }

  return { transitioned: true, warnings };
}

/**
 * 등록 일정 취소: 버튼 비활성화·안내 임베드·로그 (확정 보고 없음)
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
      warnings.push(W.cancelAnnounceInaccessible);
    } else {
      try {
        const msg = await channel.messages.fetch(canceledSession.messageId);
        const cancelEmbed = new EmbedBuilder()
          .setTitle(CancelEmbed.title(canceledSession.title))
          .setColor(EMBED_COLOR)
          .setDescription(CancelEmbed.body)
          .setFooter({ text: CancelEmbed.footer })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}${sid}:yes`)
            .setLabel("가용")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`${PREFIX}${sid}:no`)
            .setLabel("불가")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

        await msg.edit({ embeds: [cancelEmbed], components: [row] });
      } catch (err) {
        warnings.push(W.announceEditFail);
        console.error(L.sessionCancelEdit, err);
      }
    }
  } catch (err) {
    warnings.push(W.discordErr);
    console.error(L.sessionCancelFollow, err);
  }

  try {
    await appendSessionLog(sid, "CANCELED", {
      userId: actorUserId,
      payload: { warnings },
    });
  } catch (err) {
    warnings.push(W.logFail);
    console.error(L.sessionCancelLog, err);
  }

  return { transitioned: true, warnings };
}
