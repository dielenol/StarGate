/**
 * 배정 일시 24시간 전 리마인드 (가용 YES 응답자만, 15분 폴링)
 *
 * @module scheduler/reminder-checker
 */

import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { L, Remind } from "../constants/registrar-voice.js";
import {
  claimSessionStartReminder,
  extendSessionStartReminderClaimLease,
  findSessionsForStartReminder,
  markSessionStartReminderSent,
  releaseSessionStartReminderClaim,
} from "../db/sessions.js";
import { findBySessionId } from "../db/responses.js";
import { appendSessionLog } from "../db/logs.js";
import type { Session } from "../types/session.js";

/**
 * 리마인드 폴링 주기.
 * 발송 조건이 "배정 24시간 이내"라 1분 단위는 불필요하며, 일정 건수가 많을수록 DB·프로세스 부하만 커짐.
 */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** close-checker(1분 틱)과 첫 실행 시각이 겹치지 않게 */
const INITIAL_DELAY_MS = 45_000;
/** 리마인드 발송권 선점 lease */
const CLAIM_LEASE_MS = 5 * 60 * 1000;
/** 발송 완료 마킹 재시도 횟수 */
const MARK_SENT_MAX_ATTEMPTS = 3;
/** 발송 완료 마킹이 끝내 실패했을 때 중복 재발송을 막기 위한 여유 */
const POST_SEND_GUARD_MS = 15 * 60 * 1000;

const EMBED_COLOR = 0xc5a059;

async function sendSessionStartReminder(
  client: Client,
  session: Session,
  mentionLine: string
): Promise<void> {
  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  const startTs = Math.floor(session.targetDateTime.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle(Remind.title)
    .setColor(EMBED_COLOR)
    .setDescription(
      [
        Remind.lineTitle(session.title),
        Remind.lineWhen(String(startTs)),
        "",
        Remind.lineMentions(mentionLine),
      ].join("\n")
    )
    .setFooter({ text: Remind.footer });

  await channel.send({ embeds: [embed] });
}

function reminderClaimLeaseUntil(): Date {
  return new Date(Date.now() + CLAIM_LEASE_MS);
}

function reminderPostSendGuardUntil(session: Session): Date {
  const target = session.targetDateTime.getTime() + POST_SEND_GUARD_MS;
  return new Date(Math.max(Date.now() + CLAIM_LEASE_MS, target));
}

async function markReminderSentWithRetry(
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= MARK_SENT_MAX_ATTEMPTS; attempt++) {
    if (await markSessionStartReminderSent(sessionId, claimToken)) {
      return true;
    }
  }
  return false;
}

async function processSessionReminder(
  client: Client,
  session: Session
): Promise<void> {
  if (session.sessionStartReminder24hSent) return;
  if (session._id === undefined || session._id === null) return;

  const sid = String(session._id);
  const claimToken = randomUUID();
  const claimed = await claimSessionStartReminder(
    sid,
    claimToken,
    reminderClaimLeaseUntil()
  );
  if (!claimed) return;

  const responses = await findBySessionId(sid);
  const yesIds = responses
    .filter((r) => r.status === "YES")
    .map((r) => r.userId);

  if (yesIds.length === 0) {
    await releaseSessionStartReminderClaim(sid, claimToken).catch((err) => {
      console.error(L.remindClaimRelease, sid, err);
    });
    return;
  }

  const mentionLine = yesIds.map((id) => `<@${id}>`).join(" ");

  try {
    await sendSessionStartReminder(client, session, mentionLine);
  } catch (err) {
    await releaseSessionStartReminderClaim(sid, claimToken).catch((releaseErr) => {
      console.error(L.remindClaimRelease, sid, releaseErr);
    });
    throw err;
  }

  const markedSent = await markReminderSentWithRetry(sid, claimToken);
  if (!markedSent) {
    await extendSessionStartReminderClaimLease(
      sid,
      claimToken,
      reminderPostSendGuardUntil(session)
    ).catch((err) => {
      console.error(L.remindLeaseExtend, sid, err);
    });
    console.error(L.remindMarkSent, sid);
    return;
  }

  await appendSessionLog(sid, "REMINDER_SESSION_START_24H", {
    payload: { yesVoterCount: yesIds.length },
  }).catch((err) => {
    console.error(L.remindLog, sid, err);
  });
}

async function runReminderTick(client: Client): Promise<void> {
  const sessions = await findSessionsForStartReminder();
  for (const session of sessions) {
    try {
      await processSessionReminder(client, session);
    } catch (err) {
      console.error(L.remindRow, session._id, err);
    }
  }
}

/**
 * 리마인드 스케줄러를 시작합니다.
 */
export function startReminderChecker(client: Client): void {
  const tick = () => {
    void runReminderTick(client).catch((err) => {
      console.error(L.remindTick, err);
    });
  };

  setTimeout(() => {
    tick();
    setInterval(tick, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
