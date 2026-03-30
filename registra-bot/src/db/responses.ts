/**
 * 응답 CRUD 리포지토리
 *
 * session_responses 컬렉션에 대한 upsert, 조회, 집계를 담당합니다.
 * @module db/responses
 */

import { ObjectId, type Filter } from "mongodb";
import { responsesCollection, sessionsCollection } from "./index.js";
import type { Session, SessionResponse, ResponseStatus } from "../types/session.js";

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

/** 길드 내에서 특정 유저가 응답한 세션 + 응답 한 행 */
export type UserParticipationRow = {
  session: Session;
  response: SessionResponse;
};

/**
 * 이 길드에서 `userId`가 응답한 세션만, 세션 일시 오름차순으로 조회합니다.
 * @param displayLimit 표시용 상한(잘라내기 전 전체 건수는 `totalInGuild`로 반환)
 * @param options.responseStatus 지정 시 해당 응답 상태만 (예: `/일정 참여확인`은 `YES`만)
 */
export async function findUserParticipationsInGuild(
  guildId: string,
  userId: string,
  displayLimit: number,
  options?: { responseStatus?: ResponseStatus }
): Promise<{ items: UserParticipationRow[]; totalInGuild: number }> {
  const filter: Record<string, unknown> = { userId };
  if (options?.responseStatus != null) {
    filter.status = options.responseStatus;
  }
  const responses = await responsesCollection().find(filter).toArray();
  if (responses.length === 0) {
    return { items: [], totalInGuild: 0 };
  }

  const bySessionId = new Map<string, SessionResponse>();
  for (const r of responses) {
    bySessionId.set(r.sessionId, r);
  }

  const oids: ObjectId[] = [];
  for (const sid of bySessionId.keys()) {
    if (ObjectId.isValid(sid)) oids.push(new ObjectId(sid));
  }
  if (oids.length === 0) {
    return { items: [], totalInGuild: 0 };
  }

  const sessions = await sessionsCollection()
    .find({
      _id: { $in: oids },
      guildId,
    } as unknown as Filter<Session>)
    .sort({ targetDateTime: 1 })
    .toArray();

  const totalInGuild = sessions.length;
  const cap = Math.max(0, displayLimit);
  const slice = sessions.slice(0, cap);

  const items: UserParticipationRow[] = [];
  for (const session of slice) {
    const sid = String(session._id);
    const response = bySessionId.get(sid);
    if (response) items.push({ session, response });
  }

  return { items, totalInGuild };
}
