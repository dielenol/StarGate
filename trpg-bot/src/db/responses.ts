/**
 * 응답 CRUD 리포지토리
 *
 * session_responses 컬렉션에 대한 upsert, 조회, 집계를 담당합니다.
 * @module db/responses
 */

import { responsesCollection } from "./index.js";
import type { SessionResponse, ResponseStatus } from "../types/session.js";

/**
 * 사용자 응답을 저장하거나 덮어씁니다.
 * sessionId + userId가 같으면 status, displayName만 업데이트합니다.
 * @param sessionId 세션 ID
 * @param userId 디스코드 유저 ID
 * @param status 응답 상태 (YES/NO)
 * @param displayName 응답 시점의 표시명 (선택)
 */
export async function upsertResponse(
  sessionId: string,
  userId: string,
  status: ResponseStatus,
  displayName?: string
): Promise<void> {
  const now = new Date();
  const doc: Record<string, unknown> = {
    sessionId,
    userId,
    status,
    respondedAt: now,
    updatedAt: now,
  };
  if (displayName != null) doc.displayName = displayName;

  await responsesCollection().updateOne(
    { sessionId, userId },
    { $set: doc },
    { upsert: true }
  );
}

/**
 * 세션별 응답 목록을 조회합니다.
 * @param sessionId 세션 ID
 * @returns 응답 목록
 */
export async function findBySessionId(
  sessionId: string
): Promise<SessionResponse[]> {
  const cursor = responsesCollection().find({ sessionId });
  return cursor.toArray();
}

/**
 * 세션별 상태별 응답 수를 집계합니다.
 * @param sessionId 세션 ID
 * @returns { yes, no } 집계 객체
 */
export async function countByStatus(sessionId: string): Promise<{
  yes: number;
  no: number;
}> {
  const pipeline = [
    { $match: { sessionId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ];
  const results = await responsesCollection().aggregate(pipeline).toArray();

  const counts = { yes: 0, no: 0 };
  for (const row of results) {
    const status = (row._id as string).toLowerCase();
    if (status in counts) {
      counts[status as keyof typeof counts] = row.count as number;
    }
  }
  return counts;
}
