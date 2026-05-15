/**
 * trpg 세션 수정 알림 폴링 스케줄러
 *
 * @module scheduler/trpg-update-notification-checker
 */

import {
  claimUpdateNotification,
  findUnnotifiedUpdatedTrpgSessions,
  markUpdateNotificationSent,
  recordNotificationAttempt,
} from "@stargate/shared-db";

import type { Client } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { sendDmOrFallback } from "../utils/dm-with-fallback.js";
import { buildTrpgSessionDmMessage } from "../utils/trpg-session-message.js";

const LEASE_DURATION_MS = 5 * 60 * 1000;

function updateRecipients(session: TrpgSession): string[] {
  return session.updateNotificationRecipientDiscordIds?.length
    ? session.updateNotificationRecipientDiscordIds
    : session.participantDiscordIds;
}

async function processSession(
  client: Client,
  session: TrpgSession,
): Promise<void> {
  const sessionId = session._id?.toString();
  if (!sessionId) return;

  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS);
  const claimed = await claimUpdateNotification(sessionId, leaseUntil);
  if (!claimed) return;

  const payload = buildTrpgSessionDmMessage({
    kind: "update",
    session,
    sessionId,
    baseUrl: config.trpgWebBaseUrl,
  });

  for (const userId of updateRecipients(session)) {
    try {
      const result = await sendDmOrFallback(client, userId, payload, {
        fallbackChannelId: config.trpgFallbackChannelId,
        mentionUser: true,
      });

      await recordNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "update",
        deliveryMethod: result.method,
        error: result.error ?? null,
      });

      if (result.method === "failed") {
        console.warn(
          `[trpg-update] 발송 실패 — session=${sessionId} user=${userId} error=${result.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[trpg-update] 사용자 처리 예외 session=${sessionId} user=${userId}:`,
        err,
      );
      try {
        await recordNotificationAttempt({
          sessionId,
          discordUserId: userId,
          kind: "update",
          deliveryMethod: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (logErr) {
        console.error("[trpg-update] 로그 적재 실패:", logErr);
      }
    }
  }

  await markUpdateNotificationSent(sessionId);
}

export function startTrpgUpdateNotificationChecker(client: Client): () => void {
  const intervalMs = config.trpgPollingIntervalMs;

  let tickInFlight = false;
  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const now = new Date();
      const sessions = await findUnnotifiedUpdatedTrpgSessions(now);
      for (const session of sessions) {
        try {
          await processSession(client, session);
        } catch (err) {
          console.error(
            "[trpg-update] 세션 처리 실패:",
            session._id?.toString(),
            err,
          );
        }
      }
    } catch (err) {
      console.error("[trpg-update] tick 실패:", err);
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
