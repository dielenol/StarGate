/**
 * 배정 일시 24시간 전 리마인드 (가용 YES 응답자만, 15분 폴링)
 *
 * @module scheduler/reminder-checker
 */

import type { Client } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { L, Remind } from "../constants/registrar-voice.js";
import {
  findSessionsForStartReminder,
  setSessionReminderFlags,
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

const EMBED_COLOR = 0xc5a059;

async function sendSessionStartReminder(
  client: Client,
  session: Session,
  mentionLine: string,
  yesCount: number
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

  const sid = String(session._id);
  await appendSessionLog(sid, "REMINDER_SESSION_START_24H", {
    payload: { yesVoterCount: yesCount },
  });
}

async function processSessionReminder(
  client: Client,
  session: Session
): Promise<void> {
  if (session.sessionStartReminder24hSent) return;

  const responses = await findBySessionId(String(session._id));
  const yesIds = responses
    .filter((r) => r.status === "YES")
    .map((r) => r.userId);

  if (yesIds.length === 0) return;

  const mentionLine = yesIds.map((id) => `<@${id}>`).join(" ");
  const sid = String(session._id);

  await sendSessionStartReminder(client, session, mentionLine, yesIds.length);
  await setSessionReminderFlags(sid, { sessionStartReminder24hSent: true });
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
