/**
 * trpg 세션 취소 알림 폴링 스케줄러
 *
 * 흐름:
 *   - `TRPG_POLLING_INTERVAL_MS` 주기로 `findUnnotifiedCancelledTrpgSessions(now)` 폴링.
 *   - 각 세션마다:
 *       1. `claimCancellationNotification` 으로 atomic 발송권 선점 (false 면 skip)
 *       2. `participantDiscordIds` 각각에 DM (실패 시 폴백 채널 멘션)
 *       3. 시도 결과를 `recordNotificationAttempt` 로 적재
 *       4. 전 발송 완료 후 `markCancellationNotificationSent`
 *   - 취소 알림 후보는 shared-db 에서 `cancellationNotificationQueuedAt` 이 있는 문서로 제한한다.
 *
 * @module scheduler/trpg-cancellation-notification-checker
 */

import {
  claimCancellationNotification,
  findUnnotifiedCancelledTrpgSessions,
  hasDeliveredNotificationAttempt,
  markCancellationNotificationSent,
  recordNotificationAttempt,
} from "@stargate/shared-db";

import type { Client } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { sendDmOrFallback } from "../utils/dm-with-fallback.js";
import { buildTrpgSessionDmMessage } from "../utils/trpg-session-message.js";

/** lease 기간 — claim 후 발송 완료까지 5분 안에 끝낸다고 가정 */
const LEASE_DURATION_MS = 5 * 60 * 1000;

async function processSession(
  client: Client,
  session: TrpgSession,
): Promise<void> {
  const sessionId = session._id?.toString();
  if (!sessionId) return;

  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS);
  const claimed = await claimCancellationNotification(sessionId, leaseUntil);
  if (!claimed) return;

  const payload = buildTrpgSessionDmMessage({
    kind: "cancellation",
    session,
    sessionId,
    baseUrl: config.trpgWebBaseUrl,
  });

  for (const userId of session.participantDiscordIds) {
    try {
      const alreadyDelivered = await hasDeliveredNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "cancellation",
      });
      if (alreadyDelivered) continue;

      const result = await sendDmOrFallback(client, userId, payload, {
        fallbackChannelId: config.trpgFallbackChannelId,
        mentionUser: true,
      });

      await recordNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "cancellation",
        deliveryMethod: result.method,
        error: result.error ?? null,
      });

      if (result.method === "failed") {
        console.warn(
          `[trpg-cancellation] 발송 실패 — session=${sessionId} user=${userId} error=${result.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[trpg-cancellation] 사용자 처리 예외 session=${sessionId} user=${userId}:`,
        err,
      );
      try {
        await recordNotificationAttempt({
          sessionId,
          discordUserId: userId,
          kind: "cancellation",
          deliveryMethod: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (logErr) {
        console.error("[trpg-cancellation] 로그 적재 실패:", logErr);
      }
    }
  }

  await markCancellationNotificationSent(sessionId);
}

/**
 * 취소 알림 폴링 시작. 반환되는 함수를 호출하면 인터벌이 정리된다.
 *
 * tick 재진입 가드: DB/네트워크 지연으로 tick 이 interval 보다 오래 걸리면
 * 동시 실행될 수 있다. tickInFlight 플래그로 직전 tick 미완료 시 skip.
 */
export function startTrpgCancellationNotificationChecker(
  client: Client,
): () => void {
  const intervalMs = config.trpgPollingIntervalMs;

  let tickInFlight = false;
  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const now = new Date();
      const sessions = await findUnnotifiedCancelledTrpgSessions(now);
      for (const session of sessions) {
        try {
          await processSession(client, session);
        } catch (err) {
          console.error(
            "[trpg-cancellation] 세션 처리 실패:",
            session._id?.toString(),
            err,
          );
        }
      }
    } catch (err) {
      console.error("[trpg-cancellation] tick 실패:", err);
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
