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
  REGISTRAR_COLORS,
  REGISTRAR_SIGNATURE,
} from "../constants/registrar.js";
import { CancelEmbed, D, L, W } from "../constants/registrar-voice.js";
import {
  beginSessionFinalization,
  completeSessionFinalization,
  findSessionById,
  markSessionFinalizationAnnouncementDone,
  markSessionFinalizationLogDone,
  recordSessionFinalizationResultMessage,
  retractClosedSession,
} from "../db/sessions.js";
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
import { buildAnnounceLinkRow } from "../utils/announce-link.js";
import type { Session } from "../types/session.js";

const PREFIX = ATTEND_BUTTON_PREFIX;

export type SessionFinalizeResult = {
  transitioned: boolean;
  warnings: string[];
};

type PendingStatus = "CLOSING" | "CANCELING";
type FinalizationClaim = {
  session: Session;
  transitioned: boolean;
};

function buildDisabledAttendRow(sessionId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${sessionId}:yes`)
      .setLabel("가용")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}${sessionId}:no`)
      .setLabel("불가")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );
}

async function claimOrResumeFinalization(
  session: Session,
  pendingStatus: PendingStatus,
  requestedBy: string | undefined,
  kind: "CLOSE" | "CANCEL"
): Promise<FinalizationClaim | null> {
  if (session._id === undefined || session._id === null) {
    return null;
  }

  const sid = String(session._id);
  if (session.status === "OPEN") {
    const claimed = await beginSessionFinalization(
      sid,
      pendingStatus,
      kind,
      requestedBy
    );
    if (claimed) {
      return {
        transitioned: true,
        session: {
          ...session,
          status: pendingStatus,
          updatedAt: new Date(),
          finalizationPending: true,
          finalizationKind: kind,
          finalizationAnnouncementDone: false,
          finalizationLogDone: false,
          finalizationRequestedBy: requestedBy,
          finalizationRequestedAt: new Date(),
        },
      };
    }
  }

  const current = await findSessionById(sid);
  if (
    current &&
    current.status === pendingStatus &&
    current.finalizationPending &&
    current.finalizationKind === kind
  ) {
    return { transitioned: true, session: current };
  }

  return null;
}

function pushStatePersistWarning(
  warnings: string[],
  logLabel: string,
  sid: string
): void {
  warnings.push(W.statePersistFail);
  console.error(logLabel, sid);
}

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

  const claimed = await claimOrResumeFinalization(
    session,
    "CLOSING",
    options.actorUserId,
    "CLOSE"
  );
  if (!claimed) {
    return { transitioned: false, warnings };
  }

  const activeSession = claimed.session;
  const closedSession: Session = {
    ...activeSession,
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

        if (!activeSession.finalizationAnnouncementDone) {
          await msg.edit({
            embeds: [embed],
            components: [buildDisabledAttendRow(sid)],
          });
          const persisted = await markSessionFinalizationAnnouncementDone(
            sid,
            "CLOSING"
          );
          if (!persisted) {
            pushStatePersistWarning(warnings, L.sessionCloseState, sid);
          } else {
            activeSession.finalizationAnnouncementDone = true;
          }
        }
      } catch (err) {
        if (!activeSession.finalizationAnnouncementDone) {
          warnings.push(W.announceEditFail);
          console.error(L.sessionCloseAnnounceEdit, err);
        }
      }

      if (warnings.length > 0) {
        return { transitioned: true, warnings };
      }

      if (!activeSession.finalizationResultMessageId?.trim()) {
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

          const announceRow = buildAnnounceLinkRow(closedSession);
          const resultMessage = await (channel as TextChannel).send({
            content: D.closeChannelAnnounceWithHere(
              options.kind,
              safeTitleForAnnouncePing(closedSession.title)
            ),
            embeds: [resultEmbed],
            files,
            components: announceRow ? [announceRow] : undefined,
            allowedMentions: { parse: ["everyone"] },
          });

          const persisted = await recordSessionFinalizationResultMessage(
            sid,
            resultMessage.id
          );
          if (!persisted) {
            pushStatePersistWarning(warnings, L.sessionCloseState, sid);
          } else {
            activeSession.finalizationResultMessageId = resultMessage.id;
          }
        } catch (err) {
          warnings.push(W.resultSendFail);
          console.error(L.sessionCloseResultSend, err);
        }
      }
    }
  } catch (err) {
    warnings.push(W.discordErr);
    console.error(L.sessionCloseFollowup, err);
  }

  if (warnings.length > 0) {
    return { transitioned: true, warnings };
  }

  if (!activeSession.finalizationLogDone) {
    try {
      await appendSessionLog(
        sid,
        options.kind === "force" ? "FORCE_CLOSED" : "CLOSED",
        {
          userId: options.actorUserId,
          payload: {
            kind: options.kind,
            repaired: session.status !== "OPEN",
          },
        }
      );
      const persisted = await markSessionFinalizationLogDone(sid, "CLOSING");
      if (!persisted) {
        pushStatePersistWarning(warnings, L.sessionCloseState, sid);
      } else {
        activeSession.finalizationLogDone = true;
      }
    } catch (err) {
      warnings.push(W.logFail);
      console.error(L.sessionCloseLog, err);
    }
  }

  if (warnings.length > 0) {
    return { transitioned: true, warnings };
  }

  const completed = await completeSessionFinalization(sid, "CLOSING", "CLOSED");
  if (!completed) {
    pushStatePersistWarning(warnings, L.sessionCloseState, sid);
  }

  return { transitioned: true, warnings };
}

/**
 * 등록 일정 취소: 버튼 비활성화·안내 임베드·채널 공지·로그 (확정 보고 없음)
 *
 * `reason`이 주어지면 채널 공지와 `session_logs.payload`에 함께 기록됩니다.
 *
 * NOTE: 원본 공지 교정에 `CancelEmbed`를 사용합니다. 공지 포맷을 변경할 때는
 * `executeSessionRetract`와 **동기 유지**하십시오(두 경로 모두 같은 임베드 사용).
 */
export async function executeSessionCancel(
  client: Client,
  session: Session,
  actorUserId: string,
  reason: string | null
): Promise<SessionFinalizeResult> {
  const warnings: string[] = [];
  if (session._id === undefined || session._id === null) {
    console.error(L.sessionCloseNoId);
    warnings.push(W.noIdSkip);
    return { transitioned: false, warnings };
  }
  const sid = String(session._id);
  const claimed = await claimOrResumeFinalization(
    session,
    "CANCELING",
    actorUserId,
    "CANCEL"
  );
  if (!claimed) {
    return { transitioned: false, warnings };
  }

  const activeSession = claimed.session;
  const canceledSession: Session = {
    ...activeSession,
    status: "CANCELED",
    updatedAt: new Date(),
  };

  try {
    const guild = await client.guilds.fetch(canceledSession.guildId);
    const channel = await guild.channels.fetch(canceledSession.channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
      warnings.push(W.cancelAnnounceInaccessible);
    } else {
      if (!activeSession.finalizationAnnouncementDone) {
        try {
          const msg = await channel.messages.fetch(canceledSession.messageId);
          const cancelEmbed = new EmbedBuilder()
            .setTitle(CancelEmbed.title(canceledSession.title))
            .setColor(REGISTRAR_COLORS.primary)
            .setDescription(CancelEmbed.body)
            .setFooter({ text: CancelEmbed.footer })
            .setTimestamp();

          await msg.edit({
            embeds: [cancelEmbed],
            components: [buildDisabledAttendRow(sid)],
          });
          const persisted = await markSessionFinalizationAnnouncementDone(
            sid,
            "CANCELING"
          );
          if (!persisted) {
            pushStatePersistWarning(warnings, L.sessionCancelState, sid);
          } else {
            activeSession.finalizationAnnouncementDone = true;
          }
        } catch (err) {
          warnings.push(W.announceEditFail);
          console.error(L.sessionCancelEdit, err);
        }
      }

      try {
        const announceRow = buildAnnounceLinkRow(canceledSession);
        await (channel as TextChannel).send({
          content: D.cancelChannelAnnounceWithHere(
            safeTitleForAnnouncePing(canceledSession.title),
            reason
          ),
          components: announceRow ? [announceRow] : undefined,
          allowedMentions: { parse: ["everyone"] },
        });
      } catch (err) {
        warnings.push(W.cancelAnnounceInaccessible);
        console.error(L.sessionCancelAnnounce, err);
      }
    }
  } catch (err) {
    warnings.push(W.discordErr);
    console.error(L.sessionCancelFollow, err);
  }

  if (warnings.length > 0) {
    return { transitioned: true, warnings };
  }

  if (!activeSession.finalizationLogDone) {
    try {
      await appendSessionLog(sid, "CANCELED", {
        userId: actorUserId,
        payload: {
          repaired: session.status !== "OPEN",
          reason: reason ?? undefined,
        },
      });
      const persisted = await markSessionFinalizationLogDone(sid, "CANCELING");
      if (!persisted) {
        pushStatePersistWarning(warnings, L.sessionCancelState, sid);
      } else {
        activeSession.finalizationLogDone = true;
      }
    } catch (err) {
      warnings.push(W.logFail);
      console.error(L.sessionCancelLog, err);
    }
  }

  if (warnings.length > 0) {
    return { transitioned: true, warnings };
  }

  const completed = await completeSessionFinalization(
    sid,
    "CANCELING",
    "CANCELED"
  );
  if (!completed) {
    pushStatePersistWarning(warnings, L.sessionCancelState, sid);
  }

  return { transitioned: true, warnings };
}

/**
 * 이미 마감된(CLOSED) 세션을 사후 철회합니다.
 *
 * - 상태: `CLOSED` → `CANCELED` 직접 전이 (동시성 가드 포함)
 * - 원본 등재 공지(`messageId`) 는 기각 임베드로 덮어씌워 응답 버튼을 비활성화
 * - 채널에 **별도 "사후 철회" 공지**를 송부해 참여자에게 집계 무효를 알림
 * - `session_logs` 에 `CANCELED` 액션 + `payload.retractedAfterClosed=true` 및 사유 기록
 *
 * 확정 보고 메시지 자체는 보존됩니다(ID가 더 이상 DB에 없기 때문).
 */
export async function executeSessionRetract(
  client: Client,
  session: Session,
  actorUserId: string,
  reason: string | null
): Promise<SessionFinalizeResult> {
  const warnings: string[] = [];
  if (session._id === undefined || session._id === null) {
    console.error(L.sessionCloseNoId);
    warnings.push(W.noIdSkip);
    return { transitioned: false, warnings };
  }
  const sid = String(session._id);

  if (session.status !== "CLOSED") {
    return { transitioned: false, warnings };
  }

  const transitioned = await retractClosedSession(sid);
  if (!transitioned) {
    return { transitioned: false, warnings };
  }

  const retractedSession: Session = {
    ...session,
    status: "CANCELED",
    updatedAt: new Date(),
  };

  try {
    const guild = await client.guilds.fetch(retractedSession.guildId);
    const channel = await guild.channels.fetch(retractedSession.channelId);
    if (!channel?.isTextBased() || !("send" in channel)) {
      warnings.push(W.cancelAnnounceInaccessible);
    } else {
      if (retractedSession.messageId?.trim()) {
        try {
          const msg = await channel.messages.fetch(retractedSession.messageId);
          const cancelEmbed = new EmbedBuilder()
            .setTitle(CancelEmbed.title(retractedSession.title))
            .setColor(REGISTRAR_COLORS.primary)
            .setDescription(CancelEmbed.body)
            .setFooter({ text: CancelEmbed.footer })
            .setTimestamp();
          await msg.edit({
            embeds: [cancelEmbed],
            components: [buildDisabledAttendRow(sid)],
          });
        } catch (err) {
          warnings.push(W.announceEditFail);
          console.error(L.sessionRetractEdit, err);
        }
      }

      try {
        const announceRow = buildAnnounceLinkRow(retractedSession);
        await (channel as TextChannel).send({
          content: D.retractChannelAnnounceWithHere(
            safeTitleForAnnouncePing(retractedSession.title),
            reason
          ),
          components: announceRow ? [announceRow] : undefined,
          allowedMentions: { parse: ["everyone"] },
        });
      } catch (err) {
        warnings.push(W.cancelAnnounceInaccessible);
        console.error(L.sessionRetractAnnounce, err);
      }
    }
  } catch (err) {
    warnings.push(W.discordErr);
    console.error(L.sessionCancelFollow, err);
  }

  try {
    await appendSessionLog(sid, "CANCELED", {
      userId: actorUserId,
      payload: {
        retractedAfterClosed: true,
        reason: reason ?? undefined,
        // retract 경로는 재진입 인프라(claimOrResumeFinalization)를 타지 않으므로
        // Discord 부작용 실패를 감사 추적하려면 로그에 warnings를 함께 남긴다.
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (err) {
    warnings.push(W.logFail);
    console.error(L.sessionRetractLog, err);
  }

  return { transitioned: true, warnings };
}
