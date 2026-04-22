/**
 * 마감 스케줄러
 *
 * closeDateTime이 지난 OPEN 등록 일정을 주기적으로 검사하여 마감 처리합니다.
 * @module scheduler/close-checker
 */

import type { Client } from "discord.js";
import { L } from "../constants/registrar-voice.js";
import {
  findOpenSessionsPastClose,
  findSessionsPendingFinalization,
} from "../db/sessions.js";
import {
  executeSessionCancel,
  executeSessionClose,
} from "../services/session-close.js";
import type { Session } from "../types/session.js";

/** 마감 체크 주기 (밀리초, 1분) */
const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_CLOSE_ATTEMPTS = 6;

function isRateLimitError(err: unknown): err is { data?: { retry_after?: number } } {
  const e = err as { name?: string; data?: { retry_after?: number } };
  return (
    e?.name === "GatewayRateLimitError" ||
    typeof e?.data?.retry_after === "number"
  );
}

async function processOneWithRetry(
  client: Client,
  session: Session
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CLOSE_ATTEMPTS; attempt++) {
    try {
      const result =
        session.status === "CANCELING" || session.finalizationKind === "CANCEL"
          ? await executeSessionCancel(
              client,
              session,
              session.finalizationRequestedBy ?? "system",
              null
            )
          : await executeSessionClose(client, session, {
              kind: "scheduled",
              actorUserId: session.finalizationRequestedBy,
            });
      if (result.transitioned && result.warnings.length > 0) {
        console.warn(L.closeWarn, session._id, result.warnings);
      }
      return;
    } catch (err) {
      if (isRateLimitError(err)) {
        const waitMs = Math.ceil((err.data?.retry_after ?? 30) * 1000) + 750;
        console.warn(
          L.closeRateWait(waitMs / 1000, attempt, MAX_CLOSE_ATTEMPTS)
        );
        if (attempt === MAX_CLOSE_ATTEMPTS) {
          console.error(L.closeRetryExhausted, session._id);
          throw err;
        }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * 마감 스케줄러를 시작합니다.
 *
 * 반환된 `NodeJS.Timeout` 은 종료 시 `clearInterval` 로 해제해야 합니다.
 */
export function startCloseChecker(client: Client): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const [sessions, pending] = await Promise.all([
        findOpenSessionsPastClose(),
        findSessionsPendingFinalization(),
      ]);
      for (const session of [...sessions, ...pending]) {
        try {
          await processOneWithRetry(client, session);
        } catch (err) {
          console.error(L.closeFail, session._id, err);
        }
      }
    } catch (err) {
      console.error(L.closeTick, err);
    }
  }, CHECK_INTERVAL_MS);
}
