/**
 * 신규 trpg 세션 생성 알림 폴링 스케줄러
 *
 * 흐름:
 *   - `TRPG_POLLING_INTERVAL_MS` 주기로 `findUnnotifiedTrpgSessions(now)` 폴링.
 *   - 각 세션마다:
 *       1. `claimNotification` 으로 atomic 발송권 선점 (false 면 skip)
 *       2. `participantDiscordIds` 각각에 DM (실패 시 폴백 채널 멘션)
 *       3. 시도 결과를 `recordNotificationAttempt` 로 적재
 *       4. 전 발송 완료 후 `markNotificationSent`
 *   - 에러 가드: 한 세션 처리 실패가 다른 세션에 영향 없도록 try/catch.
 *
 * @module scheduler/trpg-notification-checker
 */

import {
  claimNotification,
  findUnnotifiedTrpgSessions,
  markNotificationSent,
  recordNotificationAttempt,
} from "@stargate/shared-db";

import type { BaseMessageOptions, Client } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { sendDmOrFallback } from "../utils/dm-with-fallback.js";

/** lease 기간 — claim 후 발송 완료까지 5분 안에 끝낸다고 가정 */
const LEASE_DURATION_MS = 5 * 60 * 1000;

function formatNotificationMessage(
  session: TrpgSession,
  sessionId: string,
): BaseMessageOptions {
  const url = `${config.trpgWebBaseUrl}/sessions/${sessionId}`;
  const lines = [
    "**TRPG 세션이 생성되었습니다.**",
    "",
    `세션명: **${session.title}**`,
    `일시: ${session.date} ${session.startTime} (KST)`,
    `생성자: ${session.createdByUsername}`,
    "",
    `상세: ${url}`,
    `캘린더: ${config.trpgWebBaseUrl}/calendar`,
  ];
  return { content: lines.join("\n") };
}

async function processSession(
  client: Client,
  session: TrpgSession,
): Promise<void> {
  const sessionId = session._id?.toString();
  if (!sessionId) return;

  const leaseUntil = new Date(Date.now() + LEASE_DURATION_MS);
  const claimed = await claimNotification(sessionId, leaseUntil);
  if (!claimed) return;

  const payload = formatNotificationMessage(session, sessionId);

  for (const userId of session.participantDiscordIds) {
    try {
      const result = await sendDmOrFallback(client, userId, payload, {
        fallbackChannelId: config.trpgFallbackChannelId,
        mentionUser: true,
      });

      await recordNotificationAttempt({
        sessionId,
        discordUserId: userId,
        kind: "creation",
        deliveryMethod: result.method,
        error: result.error ?? null,
      });

      if (result.method === "failed") {
        console.warn(
          `[trpg-notification] 발송 실패 — session=${sessionId} user=${userId} error=${result.error}`,
        );
      }
    } catch (err) {
      // 개별 사용자 발송 중 unhandled — 로그만 남기고 다음 사용자 진행
      console.error(
        `[trpg-notification] 사용자 처리 예외 session=${sessionId} user=${userId}:`,
        err,
      );
      try {
        await recordNotificationAttempt({
          sessionId,
          discordUserId: userId,
          kind: "creation",
          deliveryMethod: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (logErr) {
        console.error("[trpg-notification] 로그 적재 실패:", logErr);
      }
    }
  }

  await markNotificationSent(sessionId);
}

/**
 * 폴링 스케줄러 시작. 반환되는 함수를 호출하면 인터벌이 정리된다.
 *
 * tick 재진입 가드: DB/네트워크 지연으로 tick 이 interval 보다 오래 걸리면
 * 동시 실행될 수 있다. tickInFlight 플래그로 직전 tick 미완료 시 skip.
 */
export function startTrpgNotificationChecker(client: Client): () => void {
  const intervalMs = config.trpgPollingIntervalMs;

  let tickInFlight = false;
  const tick = async (): Promise<void> => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const now = new Date();
      const sessions = await findUnnotifiedTrpgSessions(now);
      for (const session of sessions) {
        try {
          await processSession(client, session);
        } catch (err) {
          console.error(
            "[trpg-notification] 세션 처리 실패:",
            session._id?.toString(),
            err,
          );
        }
      }
    } catch (err) {
      console.error("[trpg-notification] tick 실패:", err);
    } finally {
      tickInFlight = false;
    }
  };

  // 즉시 한 번 실행 (기동 직후 미발송 세션 처리)
  void tick();

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(handle);
}
