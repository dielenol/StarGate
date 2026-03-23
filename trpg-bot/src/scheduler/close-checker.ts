/**
 * 마감 스케줄러
 *
 * closeDateTime이 지난 OPEN 세션을 주기적으로 검사하여 마감 처리합니다.
 * @module scheduler/close-checker
 */

import type { Client } from "discord.js";
import { findOpenSessionsPastClose } from "../db/sessions.js";
import { executeSessionClose } from "../services/session-close.js";
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
      await executeSessionClose(client, session, { kind: "scheduled" });
      return;
    } catch (err) {
      if (isRateLimitError(err)) {
        const waitMs = Math.ceil((err.data?.retry_after ?? 30) * 1000) + 750;
        console.warn(
          `[close-checker] rate limit, ${(waitMs / 1000).toFixed(1)}초 후 재시도 (${attempt}/${MAX_CLOSE_ATTEMPTS})`
        );
        if (attempt === MAX_CLOSE_ATTEMPTS) {
          console.error("[close-checker] 마감 재시도 한도 초과:", session._id);
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
 */
export function startCloseChecker(client: Client): void {
  setInterval(async () => {
    try {
      const sessions = await findOpenSessionsPastClose();
      for (const session of sessions) {
        try {
          await processOneWithRetry(client, session);
        } catch (err) {
          console.error("[close-checker] 세션 마감 실패:", session._id, err);
        }
      }
    } catch (err) {
      console.error("[close-checker] 마감 처리 오류:", err);
    }
  }, CHECK_INTERVAL_MS);
}
