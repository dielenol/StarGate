/**
 * 24h 리마인드 폴링 스케줄러
 *
 * 흐름:
 *   - `TRPG_REMINDER_INTERVAL_MS` 주기로 폴링.
 *   - 매 틱:
 *       windowStart = now + 24h - bufferMs
 *       windowEnd   = now + 24h + bufferMs   (buffer = interval, 누락 방지)
 *       `findDueReminderSessions(windowStart, windowEnd)` 호출.
 *   - 각 세션마다 `claimReminder` 선점 후 참가자 DM (kind: reminder24h),
 *     `recordNotificationAttempt` + `markReminderSent`.
 *
 * @module scheduler/trpg-reminder-checker
 */

import {
  claimReminder,
  findDueReminderSessions,
  hasDeliveredNotificationAttempt,
  markReminderSent,
  recordNotificationAttempt,
} from "@stargate/shared-db";

import type { Client } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { sendDmOrFallback } from "../utils/dm-with-fallback.js";
import { buildTrpgSessionDmMessage } from "../utils/trpg-session-message.js";

/** lease 기간 — claim 후 발송 완료까지 5분 안에 끝낸다고 가정 */
const LEASE_DURATION_MS = 5 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function processSession(
  client: Client,
  session: TrpgSession,
): Promise<void> {
  const sessionId = session._id?.toString();
  if (!sessionId) return;

  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS);
  const claimed = await claimReminder(sessionId, leaseUntil);
  if (!claimed) return;

  const payload = buildTrpgSessionDmMessage({
    kind: "reminder24h",
    session,
    sessionId,
    baseUrl: config.trpgWebBaseUrl,
  });

  for (const userId of session.participantDiscordIds) {
    try {
      const alreadyDelivered = await hasDeliveredNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "reminder24h",
      });
      if (alreadyDelivered) continue;

      const result = await sendDmOrFallback(client, userId, payload, {
        fallbackChannelId: config.trpgFallbackChannelId,
        mentionUser: true,
      });

      await recordNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "reminder24h",
        deliveryMethod: result.method,
        error: result.error ?? null,
      });

      if (result.method === "failed") {
        console.warn(
          `[trpg-reminder] 발송 실패 — session=${sessionId} user=${userId} error=${result.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[trpg-reminder] 사용자 처리 예외 session=${sessionId} user=${userId}:`,
        err,
      );
      try {
        await recordNotificationAttempt({
          sessionId,
          discordUserId: userId,
          kind: "reminder24h",
          deliveryMethod: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (logErr) {
        console.error("[trpg-reminder] 로그 적재 실패:", logErr);
      }
    }
  }

  await markReminderSent(sessionId);
}

/**
 * 리마인드 폴링 시작. 반환된 함수 호출 시 인터벌 정리.
 *
 * 윈도우 설계:
 *   - center = now + 24h
 *   - buffer = intervalMs * 2 (단일 tick 지연으로 윈도우 사이가 비는 사고 방지.
 *     GC/네트워크 hang 대응으로 interval 의 2배 마진 확보)
 *   - windowStart = center - buffer, windowEnd = center + buffer
 *   - 따라서 한 세션은 ±2*interval 내 중복 노출되지만 `claimReminder` 가 atomic 차단.
 *
 * tick 재진입 가드:
 *   - DB/네트워크 지연으로 tick 이 interval 보다 오래 걸리면 동시 실행될 수 있다.
 *   - tickInFlight 플래그로 직전 tick 미완료 시 skip (다음 인터벌 때 재시도).
 */
export function startTrpgReminderChecker(client: Client): () => void {
  const intervalMs = config.trpgReminderIntervalMs;
  // 단일 tick 지연으로 윈도우 사이가 비는 사고 방지. interval 의 2배로 마진 확보.
  const bufferMs = intervalMs * 2;

  let tickInFlight = false;
  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const now = new Date();
      const center = now.getTime() + ONE_DAY_MS;
      const windowStart = new Date(center - bufferMs);
      const windowEnd = new Date(center + bufferMs);

      const sessions = await findDueReminderSessions(windowStart, windowEnd);
      for (const session of sessions) {
        try {
          await processSession(client, session);
        } catch (err) {
          console.error(
            "[trpg-reminder] 세션 처리 실패:",
            session._id?.toString(),
            err,
          );
        }
      }
    } catch (err) {
      console.error("[trpg-reminder] tick 실패:", err);
    } finally {
      tickInFlight = false;
    }
  };

  void tick();

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(handle);
}
