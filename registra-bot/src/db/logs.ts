/**
 * 세션 운영 로그 저장
 *
 * @module db/logs
 */

import { sessionLogsCollection } from "./index.js";
import type { SessionLogType } from "../types/session-log.js";

/**
 * 세션 관련 운영 로그를 기록합니다.
 */
export async function appendSessionLog(
  sessionId: string,
  type: SessionLogType,
  options?: { userId?: string; payload?: Record<string, unknown> }
): Promise<void> {
  await sessionLogsCollection().insertOne({
    sessionId,
    type,
    userId: options?.userId,
    payload: options?.payload,
    createdAt: new Date(),
  });
}
