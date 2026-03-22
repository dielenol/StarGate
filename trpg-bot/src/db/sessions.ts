/**
 * 세션 CRUD 리포지토리
 *
 * sessions 컬렉션에 대한 생성, 조회, 상태 업데이트를 담당합니다.
 * @module db/sessions
 */

import { ObjectId, type Filter } from "mongodb";
import { sessionsCollection } from "./index.js";
import type { Session, SessionStatus } from "../types/session.js";

/** MongoDB 내부 _id는 ObjectId이므로 필터용 타입 */
type SessionFilter = Filter<Session> & { _id?: ObjectId };

/** 세션 생성 시 필요한 입력 (DB 자동 필드 제외) */
export type CreateSessionInput = Omit<
  Session,
  "_id" | "createdAt" | "updatedAt"
> & { createdAt?: Date; updatedAt?: Date };

/**
 * 새 세션을 DB에 저장합니다.
 * @param input 세션 데이터
 * @returns 생성된 세션의 _id (문자열)
 */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const now = new Date();
  const doc: Session = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  const result = await sessionsCollection().insertOne(doc);
  return result.insertedId.toString();
}

/**
 * ID로 세션을 조회합니다.
 * @param sessionId ObjectId 문자열
 * @returns 세션 또는 null
 */
export async function findSessionById(
  sessionId: string
): Promise<Session | null> {
  if (!ObjectId.isValid(sessionId)) return null;

  const doc = await sessionsCollection().findOne({
    _id: new ObjectId(sessionId),
  } as SessionFilter);
  return doc;
}

/**
 * 세션 상태를 업데이트합니다.
 * @param sessionId ObjectId 문자열
 * @param status 새 상태
 * @returns 업데이트 성공 여부
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set: { status, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

/**
 * 세션의 공지 메시지 ID를 업데이트합니다.
 * 공지 전송 직후 호출합니다.
 * @param sessionId ObjectId 문자열
 * @param messageId 디스코드 메시지 ID
 * @returns 업데이트 성공 여부
 */
export async function updateSessionMessageId(
  sessionId: string,
  messageId: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set: { messageId, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

/**
 * 마감 시간이 지난 OPEN 상태 세션을 조회합니다.
 * 마감 스케줄러에서 사용합니다.
 * @param guildId 길드 ID (선택, 필터용)
 * @returns 마감 대상 세션 목록
 */
export async function findOpenSessionsPastClose(
  guildId?: string
): Promise<Session[]> {
  const now = new Date();
  const filter: Record<string, unknown> = {
    status: "OPEN",
    closeDateTime: { $lte: now },
  };
  if (guildId) filter.guildId = guildId;

  const cursor = sessionsCollection().find(filter);
  return cursor.toArray();
}
