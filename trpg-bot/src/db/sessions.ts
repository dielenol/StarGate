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
 * 세션을 삭제합니다.
 * 생성 보상 롤백에 사용합니다.
 * @param sessionId ObjectId 문자열
 * @returns 삭제 성공 여부
 */
export async function deleteSessionById(sessionId: string): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().deleteOne({
    _id: new ObjectId(sessionId),
  } as SessionFilter);
  return result.deletedCount > 0;
}

/**
 * 세션 상태를 현재 값이 일치할 때만 갱신합니다(CAS).
 * 동시 마감/취소 중복 실행을 막는 데 사용합니다.
 * @param sessionId ObjectId 문자열
 * @param currentStatuses 현재 허용 상태(예: OPEN)
 * @param nextStatus 새 상태
 * @returns 상태 전이 성공 여부
 */
export async function updateSessionStatusIfCurrent(
  sessionId: string,
  currentStatuses: SessionStatus | SessionStatus[],
  nextStatus: SessionStatus
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const expected = Array.isArray(currentStatuses)
    ? currentStatuses
    : [currentStatuses];

  const result = await sessionsCollection().updateOne(
    {
      _id: new ObjectId(sessionId),
      status: { $in: expected },
    } as unknown as SessionFilter,
    { $set: { status: nextStatus, updatedAt: new Date() } }
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

/**
 * 모든 OPEN 세션을 조회합니다 (리마인드·수동 마감 등).
 */
export async function findAllOpenSessions(): Promise<Session[]> {
  return sessionsCollection().find({ status: "OPEN" }).toArray();
}

/**
 * 특정 길드의 OPEN 세션만, 최근 생성 순으로 조회합니다.
 */
export async function findOpenSessionsByGuild(
  guildId: string
): Promise<Session[]> {
  const cursor = sessionsCollection().find({ guildId, status: "OPEN" });
  return cursor.sort({ createdAt: -1 }).toArray();
}

/**
 * 길드의 OPEN·CLOSED 세션을 **세션 일시(`targetDateTime`) 오름차순**으로 최대 `limit`건 조회합니다.
 * `/일정 한눈에` 등 월별 일정에 사용합니다.
 */
export async function findOpenAndClosedSessionsByGuildOrderByTarget(
  guildId: string,
  limit: number
): Promise<Session[]> {
  return sessionsCollection()
    .find({ guildId, status: { $in: ["OPEN", "CLOSED"] } })
    .sort({ targetDateTime: 1 })
    .limit(limit)
    .toArray();
}

/**
 * 같은 길드에서 `targetDateTime`이 (봇 서버 기준) 해당 연·월에 속하는 OPEN/CLOSED 세션.
 * 결과 카드 캘린더에 동일 달 세션을 함께 표시할 때 사용합니다.
 */
export async function findSessionsByGuildInMonth(
  guildId: string,
  year: number,
  monthIndex: number
): Promise<Session[]> {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return sessionsCollection()
    .find({
      guildId,
      status: { $in: ["OPEN", "CLOSED"] },
      targetDateTime: { $gte: start, $lte: end },
    })
    .sort({ targetDateTime: 1 })
    .toArray();
}

/**
 * 세션 시작 24시간 이내이면서 아직 시작 전인 세션 중, 시작 리마인드를 아직 안 보낸 것.
 * 응답 마감으로 이미 `CLOSED`여도 세션 일시 전이면 포함합니다.
 */
export async function findSessionsForStartReminder(): Promise<Session[]> {
  const now = new Date();
  const within24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const filter: Filter<Session> = {
    status: { $in: ["OPEN", "CLOSED"] },
    targetDateTime: { $gt: now, $lte: within24h },
    $or: [
      { sessionStartReminder24hSent: { $exists: false } },
      { sessionStartReminder24hSent: false },
    ],
  };

  return sessionsCollection().find(filter).toArray();
}

/**
 * 길드 내 가장 최근 생성된 OPEN 세션 1건을 조회합니다.
 */
export async function findLatestOpenSessionByGuild(
  guildId: string
): Promise<Session | null> {
  return sessionsCollection().findOne(
    { guildId, status: "OPEN" },
    { sort: { createdAt: -1 } }
  );
}

/**
 * 길드 내 가장 최근 마감된(CLOSED) 세션 1건을 조회합니다.
 */
export async function findLatestClosedSessionByGuild(
  guildId: string
): Promise<Session | null> {
  return sessionsCollection().findOne(
    { guildId, status: "CLOSED" },
    { sort: { updatedAt: -1 } }
  );
}

/**
 * ID로 세션을 조회하되 해당 길드에 속한지 검증합니다.
 */
export async function findSessionByIdInGuild(
  sessionId: string,
  guildId: string
): Promise<Session | null> {
  const s = await findSessionById(sessionId);
  if (!s || s.guildId !== guildId) return null;
  return s;
}

/**
 * 응답 마감 일시만 변경합니다. 세션 시작 리마인드 플래그는 그대로 둡니다.
 */
export async function updateSessionCloseDateTime(
  sessionId: string,
  closeDateTime: Date
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    {
      $set: {
        closeDateTime,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * 세션 진행 일시(`targetDateTime`)를 변경합니다.
 * 일정이 바뀌므로 시작 24시간 전 리마인드 플래그를 초기화합니다.
 */
export async function updateSessionTargetDateTime(
  sessionId: string,
  targetDateTime: Date
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    {
      $set: {
        targetDateTime,
        updatedAt: new Date(),
        sessionStartReminder24hSent: false,
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * 세션 일시·응답 마감을 한 번에 갱신합니다 (일정 수정 시 마감 자동 맞춤용).
 * 리마인드 플래그는 초기화합니다.
 */
export async function updateSessionTargetAndCloseDateTime(
  sessionId: string,
  targetDateTime: Date,
  closeDateTime: Date
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    {
      $set: {
        targetDateTime,
        closeDateTime,
        updatedAt: new Date(),
        sessionStartReminder24hSent: false,
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * 리마인드 발송 플래그를 설정합니다.
 */
export async function setSessionReminderFlags(
  sessionId: string,
  flags: { sessionStartReminder24hSent?: boolean }
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (flags.sessionStartReminder24hSent !== undefined)
    $set.sessionStartReminder24hSent = flags.sessionStartReminder24hSent;

  const result = await sessionsCollection().updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set }
  );
  return result.modifiedCount > 0;
}
