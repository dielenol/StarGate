/**
 * 등록 일정 마감·취소 공통 처리
 *
 * 스케줄러·강제 마감·취소에서 재사용합니다.
 * @module services/session-close
 */

import type { Client, MessageCreateOptions } from "discord.js";
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
  retractClosedSession,
} from "../db/sessions.js";
import {
  appendFinalizationLogOnce,
  buildFinalizationMessageNonce,
  claimSessionFinalizationLease,
  completeFinalizationWithLease,
  extendSessionFinalizationLease,
  getFinalizationDeliveryDisposition,
  markFinalizationAnnouncementDone,
  markFinalizationDeliveryDispatching,
  markFinalizationDeliveryUnknown,
  markFinalizationLogDone,
  recordFinalizationResultMessage,
  releaseSessionFinalizationLease,
} from "../db/finalization-lease.js";
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
  claimToken: string;
  session: Session & { finalizationOperationKey: string };
};

const RESULT_MESSAGE_RECORD_ATTEMPTS = 3;
const DELIVERY_RECONCILIATION_WARNING =
  "Discord 결과 공지 전달 상태 확인이 필요합니다.";

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
  kind: "CLOSE" | "CANCEL",
  trigger: "scheduled" | "force" | "cancel",
  cancelReason?: string | null
): Promise<FinalizationClaim | null> {
  if (session._id === undefined || session._id === null) {
    return null;
  }

  const sid = String(session._id);
  if (session.status === "OPEN") {
    await beginSessionFinalization(
      sid,
      pendingStatus,
      kind,
      {
        trigger,
        requestedBy,
        cancelReason,
      }
    );
  }

  const lease = await claimSessionFinalizationLease(
    sid,
    pendingStatus,
    kind
  );
  if (!lease?.session.finalizationOperationKey?.trim()) return null;
  return {
    claimToken: lease.token,
    session: lease.session as Session & { finalizationOperationKey: string },
  };
}

export function resolveCloseFinalizationContext(
  session: Session,
  fallback: { kind: "scheduled" | "force"; actorUserId?: string }
): { kind: "scheduled" | "force"; actorUserId?: string } {
  const storedTrigger = session.finalizationTrigger;
  return {
    kind:
      storedTrigger === "scheduled" || storedTrigger === "force"
        ? storedTrigger
        : fallback.kind,
    actorUserId: session.finalizationRequestedBy ?? fallback.actorUserId,
  };
}

export function resolveCancelFinalizationContext(
  session: Session,
  fallback: { actorUserId: string; reason: string | null }
): { actorUserId: string; reason: string | null } {
  return {
    actorUserId: session.finalizationRequestedBy ?? fallback.actorUserId,
    reason:
      session.finalizationCancelReason !== undefined
        ? session.finalizationCancelReason
        : fallback.reason,
  };
}

function pushStatePersistWarning(
  warnings: string[],
  logLabel: string,
  sid: string
): void {
  warnings.push(W.statePersistFail);
  console.error(logLabel, sid);
}

async function renewFinalizationLeaseOrWarn(
  warnings: string[],
  sid: string,
  status: PendingStatus,
  claimToken: string,
  logLabel: string
): Promise<boolean> {
  try {
    const renewed = await extendSessionFinalizationLease(
      sid,
      status,
      claimToken
    );
    if (renewed) return true;
  } catch (err) {
    console.error(logLabel, sid, err);
  }
  pushStatePersistWarning(warnings, logLabel, sid);
  return false;
}

async function persistResultMessageWithRetry(
  sid: string,
  status: PendingStatus,
  claimToken: string,
  messageId: string,
  logLabel: string
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RESULT_MESSAGE_RECORD_ATTEMPTS; attempt++) {
    try {
      if (
        await recordFinalizationResultMessage(
          sid,
          status,
          claimToken,
          messageId
        )
      ) {
        return true;
      }
    } catch (err) {
      lastError = err;
    }
  }
  console.error(logLabel, sid, lastError);
  return false;
}

async function releaseFinalizationLeaseSafely(
  sid: string,
  claimToken: string
): Promise<void> {
  await releaseSessionFinalizationLease(sid, claimToken).catch((err) => {
    console.error(L.finalizationClaimRelease, sid, err);
  });
}

async function prepareFinalizationDelivery(
  warnings: string[],
  sid: string,
  status: PendingStatus,
  claimToken: string,
  activeSession: Session,
  logLabel: string
): Promise<boolean> {
  const disposition = getFinalizationDeliveryDisposition(
    activeSession.finalizationDeliveryState,
    activeSession.finalizationResultMessageId
  );
  if (disposition === "SKIP") return false;

  if (disposition === "RECONCILE") {
    if (activeSession.finalizationDeliveryState !== "DELIVERY_UNKNOWN") {
      try {
        await markFinalizationDeliveryUnknown(sid, status, claimToken);
      } catch (err) {
        console.error(logLabel, sid, err);
      }
    }
    warnings.push(DELIVERY_RECONCILIATION_WARNING);
    return false;
  }

  try {
    const marked = await markFinalizationDeliveryDispatching(
      sid,
      status,
      claimToken
    );
    if (marked) {
      activeSession.finalizationDeliveryState = "DISPATCHING";
      return true;
    }
  } catch (err) {
    console.error(logLabel, sid, err);
  }
  pushStatePersistWarning(warnings, logLabel, sid);
  return false;
}

async function quarantineUnknownDelivery(
  warnings: string[],
  sid: string,
  status: PendingStatus,
  claimToken: string,
  activeSession: Session,
  logLabel: string,
  observedMessageId?: string
): Promise<void> {
  try {
    const marked = await markFinalizationDeliveryUnknown(
      sid,
      status,
      claimToken,
      observedMessageId
    );
    if (marked) {
      activeSession.finalizationDeliveryState = "DELIVERY_UNKNOWN";
    } else {
      console.error(logLabel, sid);
    }
  } catch (err) {
    console.error(logLabel, sid, err);
  }
  warnings.push(DELIVERY_RECONCILIATION_WARNING);
}

/**
 * 결과 카드/문구 생성과 마지막 lease 갱신을 모두 끝낸 뒤에만 전달 상태를
 * DISPATCHING으로 바꾼다. Discord 요청 전에 실패한 작업은 PENDING에 남아
 * 다음 lease에서 안전하게 재시도할 수 있다.
 */
export async function prepareFinalizationDispatchAttempt<T>(
  buildPayload: () => Promise<T> | T,
  renewLease: () => Promise<boolean>,
  markDispatching: () => Promise<boolean>
): Promise<T | null> {
  const payload = await buildPayload();
  if (!(await renewLease())) return null;
  if (!(await markDispatching())) return null;
  return payload;
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
    "CLOSE",
    options.kind
  );
  if (!claimed) {
    return { transitioned: false, warnings };
  }

  try {
    const activeSession = claimed.session;
    const context = resolveCloseFinalizationContext(activeSession, options);
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
            if (
              !(await renewFinalizationLeaseOrWarn(
                warnings,
                sid,
                "CLOSING",
                claimed.claimToken,
                L.sessionCloseState
              ))
            ) {
              return { transitioned: true, warnings };
            }
            await msg.edit({
              embeds: [embed],
              components: [buildDisabledAttendRow(sid)],
            });
            const persisted = await markFinalizationAnnouncementDone(
              sid,
              "CLOSING",
              claimed.claimToken
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
            const messagePayload =
              await prepareFinalizationDispatchAttempt<MessageCreateOptions>(
                async () => {
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
                      ? [
                          new AttachmentBuilder(cardPng, {
                            name: "session-result.png",
                          }),
                        ]
                      : undefined;
                  const announceRow = buildAnnounceLinkRow(closedSession);
                  return {
                    content: D.closeChannelAnnounceWithHere(
                      context.kind,
                      safeTitleForAnnouncePing(closedSession.title)
                    ),
                    embeds: [resultEmbed],
                    files,
                    components: announceRow ? [announceRow] : undefined,
                    allowedMentions: { parse: ["everyone"] },
                    nonce: buildFinalizationMessageNonce(
                      sid,
                      "CLOSE",
                      activeSession.finalizationRequestedAt
                    ),
                    enforceNonce: true,
                  };
                },
                () =>
                  renewFinalizationLeaseOrWarn(
                    warnings,
                    sid,
                    "CLOSING",
                    claimed.claimToken,
                    L.sessionCloseState
                  ),
                () =>
                  prepareFinalizationDelivery(
                    warnings,
                    sid,
                    "CLOSING",
                    claimed.claimToken,
                    activeSession,
                    L.sessionCloseState
                  )
              );
            if (!messagePayload) {
              return { transitioned: true, warnings };
            }

            const resultMessage = await (channel as TextChannel).send(
              messagePayload
            );

            const persisted = await persistResultMessageWithRetry(
              sid,
              "CLOSING",
              claimed.claimToken,
              resultMessage.id,
              L.sessionCloseState
            );
            if (!persisted) {
              await quarantineUnknownDelivery(
                warnings,
                sid,
                "CLOSING",
                claimed.claimToken,
                activeSession,
                L.sessionCloseState,
                resultMessage.id
              );
            } else {
              activeSession.finalizationResultMessageId = resultMessage.id;
              activeSession.finalizationDeliveryState = "SENT";
            }
          } catch (err) {
            if (activeSession.finalizationDeliveryState === "DISPATCHING") {
              await quarantineUnknownDelivery(
                warnings,
                sid,
                "CLOSING",
                claimed.claimToken,
                activeSession,
                L.sessionCloseState
              );
            }
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
        if (
          !(await renewFinalizationLeaseOrWarn(
            warnings,
            sid,
            "CLOSING",
            claimed.claimToken,
            L.sessionCloseState
          ))
        ) {
          return { transitioned: true, warnings };
        }
        await appendFinalizationLogOnce(
          sid,
          activeSession.finalizationOperationKey,
          context.kind === "force" ? "FORCE_CLOSED" : "CLOSED",
          {
            userId: context.actorUserId,
            payload: {
              kind: context.kind,
              repaired: session.status !== "OPEN",
            },
          }
        );
        const persisted = await markFinalizationLogDone(
          sid,
          "CLOSING",
          claimed.claimToken,
          activeSession.finalizationOperationKey
        );
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

    const completed = await completeFinalizationWithLease(
      sid,
      "CLOSING",
      "CLOSED",
      claimed.claimToken
    );
    if (!completed) {
      pushStatePersistWarning(warnings, L.sessionCloseState, sid);
    }

    return { transitioned: true, warnings };
  } finally {
    await releaseFinalizationLeaseSafely(sid, claimed.claimToken);
  }
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
    "CANCEL",
    "cancel",
    reason
  );
  if (!claimed) {
    return { transitioned: false, warnings };
  }

  try {
    const activeSession = claimed.session;
    const context = resolveCancelFinalizationContext(activeSession, {
      actorUserId,
      reason,
    });
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

            if (
              !(await renewFinalizationLeaseOrWarn(
                warnings,
                sid,
                "CANCELING",
                claimed.claimToken,
                L.sessionCancelState
              ))
            ) {
              return { transitioned: true, warnings };
            }
            await msg.edit({
              embeds: [cancelEmbed],
              components: [buildDisabledAttendRow(sid)],
            });
            const persisted = await markFinalizationAnnouncementDone(
              sid,
              "CANCELING",
              claimed.claimToken
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

        if (warnings.length > 0) {
          return { transitioned: true, warnings };
        }

        const legacyCancelNoticeAlreadySent =
          activeSession.finalizationLogDone === true &&
          !activeSession.finalizationResultMessageId?.trim();
        if (
          !activeSession.finalizationResultMessageId?.trim() &&
          !legacyCancelNoticeAlreadySent
        ) {
          try {
            const messagePayload =
              await prepareFinalizationDispatchAttempt<MessageCreateOptions>(
                () => {
                  const announceRow = buildAnnounceLinkRow(canceledSession);
                  return {
                    content: D.cancelChannelAnnounceWithHere(
                      safeTitleForAnnouncePing(canceledSession.title),
                      context.reason
                    ),
                    components: announceRow ? [announceRow] : undefined,
                    allowedMentions: { parse: ["everyone"] },
                    nonce: buildFinalizationMessageNonce(
                      sid,
                      "CANCEL",
                      activeSession.finalizationRequestedAt
                    ),
                    enforceNonce: true,
                  };
                },
                () =>
                  renewFinalizationLeaseOrWarn(
                    warnings,
                    sid,
                    "CANCELING",
                    claimed.claimToken,
                    L.sessionCancelState
                  ),
                () =>
                  prepareFinalizationDelivery(
                    warnings,
                    sid,
                    "CANCELING",
                    claimed.claimToken,
                    activeSession,
                    L.sessionCancelState
                  )
              );
            if (!messagePayload) {
              return { transitioned: true, warnings };
            }
            const resultMessage = await (channel as TextChannel).send(
              messagePayload
            );

            const persisted = await persistResultMessageWithRetry(
              sid,
              "CANCELING",
              claimed.claimToken,
              resultMessage.id,
              L.sessionCancelState
            );
            if (!persisted) {
              await quarantineUnknownDelivery(
                warnings,
                sid,
                "CANCELING",
                claimed.claimToken,
                activeSession,
                L.sessionCancelState,
                resultMessage.id
              );
            } else {
              activeSession.finalizationResultMessageId = resultMessage.id;
              activeSession.finalizationDeliveryState = "SENT";
            }
          } catch (err) {
            if (activeSession.finalizationDeliveryState === "DISPATCHING") {
              await quarantineUnknownDelivery(
                warnings,
                sid,
                "CANCELING",
                claimed.claimToken,
                activeSession,
                L.sessionCancelState
              );
            }
            warnings.push(W.cancelAnnounceInaccessible);
            console.error(L.sessionCancelAnnounce, err);
          }
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
        if (
          !(await renewFinalizationLeaseOrWarn(
            warnings,
            sid,
            "CANCELING",
            claimed.claimToken,
            L.sessionCancelState
          ))
        ) {
          return { transitioned: true, warnings };
        }
        await appendFinalizationLogOnce(
          sid,
          activeSession.finalizationOperationKey,
          "CANCELED",
          {
            userId: context.actorUserId,
            payload: {
              repaired: session.status !== "OPEN",
              reason: context.reason ?? undefined,
            },
          }
        );
        const persisted = await markFinalizationLogDone(
          sid,
          "CANCELING",
          claimed.claimToken,
          activeSession.finalizationOperationKey
        );
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

    const completed = await completeFinalizationWithLease(
      sid,
      "CANCELING",
      "CANCELED",
      claimed.claimToken
    );
    if (!completed) {
      pushStatePersistWarning(warnings, L.sessionCancelState, sid);
    }

    return { transitioned: true, warnings };
  } finally {
    await releaseFinalizationLeaseSafely(sid, claimed.claimToken);
  }
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
