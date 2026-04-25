/**
 * 응답 CRUD 리포지토리
 *
 * session_responses 컬렉션에 대한 upsert, 조회, 집계를 담당합니다.
 */

import { ObjectId, type Filter } from "mongodb";

import type {
  Session,
  SessionResponse,
  ResponseStatus,
} from "../types/index.js";

import { sessionResponsesCol, sessionsCol } from "../collections.js";

/** 사용자 응답을 저장하거나 덮어씁니다. */
export async function upsertResponse(
  sessionId: string,
  userId: string,
  status: ResponseStatus,
  displayName?: string
): Promise<void> {
  const col = await sessionResponsesCol();
  const now = new Date();
  const doc: Record<string, unknown> = {
    sessionId,
    userId,
    status,
    respondedAt: now,
    updatedAt: now,
  };
  if (displayName != null) doc.displayName = displayName;

  await col.updateOne(
    { sessionId, userId },
    { $set: doc },
    { upsert: true }
  );
}

/** 세션별 응답 목록을 조회합니다. */
export async function findBySessionId(
  sessionId: string
): Promise<SessionResponse[]> {
  const col = await sessionResponsesCol();
  return col.find({ sessionId }).toArray();
}

/**
 * 전역(모든 길드) `status: "YES"` 응답을 userId 키로 집계해 반환한다.
 *
 * ⚠️ 현재 단일 길드 운영 전제. 다중 길드 확장 시 `guildId` 파라미터를 추가하거나,
 * `sessions` 컬렉션과 aggregate pipeline으로 스코프를 좁혀야 한다.
 *
 * 반환 키는 `session_responses.userId` = Discord snowflake userId 기준.
 */
export async function countParticipationByUserId(): Promise<
  Record<string, number>
> {
  const col = await sessionResponsesCol();
  const responses = await col
    .find({ status: "YES" })
    .project<{ userId: string }>({ userId: 1 })
    .toArray();

  const counts: Record<string, number> = {};
  for (const r of responses) {
    const uid = r.userId;
    counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
}

/** 세션별 상태별 응답 수를 집계합니다. */
export async function countByStatus(sessionId: string): Promise<{
  yes: number;
  no: number;
}> {
  const col = await sessionResponsesCol();
  const pipeline = [
    { $match: { sessionId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ];
  const results = await col.aggregate(pipeline).toArray();

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

/** 이 길드에서 userId가 응답한 세션을, 세션 일시 오름차순으로 조회합니다. */
export async function findUserParticipationsInGuild(
  guildId: string,
  userId: string,
  displayLimit: number,
  options?: { responseStatus?: ResponseStatus }
): Promise<{ items: UserParticipationRow[]; totalInGuild: number }> {
  const responsesColInstance = await sessionResponsesCol();
  const filter: Record<string, unknown> = { userId };
  if (options?.responseStatus != null) {
    filter.status = options.responseStatus;
  }
  const responses = await responsesColInstance.find(filter).toArray();
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

  const sessionsColInstance = await sessionsCol();
  const sessions = await sessionsColInstance
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

/**
 * 여러 세션의 응답을 한 번에 조회한다.
 *
 * `responses_sessionId_userId_unique` 인덱스(sessionId 선두)를 활용한 $in 쿼리.
 * 빈 배열 입력은 즉시 빈 배열 반환으로 short-circuit.
 *
 * @param sessionIds 조회 대상 세션 ID 배열
 */
export async function findResponsesBySessionIds(
  sessionIds: string[]
): Promise<SessionResponse[]> {
  if (sessionIds.length === 0) return [];
  const col = await sessionResponsesCol();
  return col.find({ sessionId: { $in: sessionIds } }).toArray();
}

/**
 * 여러 세션의 `{ yes, no }` 카운트를 한 번에 집계한다.
 *
 * `responses_sessionId_status` 인덱스를 활용한 aggregate pipeline.
 * 응답이 없는 세션도 `{ yes: 0, no: 0 }` 로 채워 반환한다 — 호출처에서 안전하게 lookup.
 *
 * @param sessionIds 집계 대상 세션 ID 배열
 * @returns sessionId → { yes, no } 맵
 */
export async function countByStatusBulk(
  sessionIds: string[]
): Promise<Record<string, { yes: number; no: number }>> {
  const base: Record<string, { yes: number; no: number }> = {};
  for (const sid of sessionIds) base[sid] = { yes: 0, no: 0 };

  if (sessionIds.length === 0) return base;

  const col = await sessionResponsesCol();
  const pipeline = [
    { $match: { sessionId: { $in: sessionIds } } },
    {
      $group: {
        _id: { sid: "$sessionId", st: "$status" },
        c: { $sum: 1 },
      },
    },
  ];

  const rows = await col
    .aggregate<{
      _id: { sid: string; st: string };
      c: number;
    }>(pipeline)
    .toArray();

  for (const row of rows) {
    const bucket = base[row._id.sid];
    if (!bucket) continue;
    const status = row._id.st.toLowerCase();
    if (status === "yes" || status === "no") {
      bucket[status] = row.c;
    }
  }

  return base;
}
