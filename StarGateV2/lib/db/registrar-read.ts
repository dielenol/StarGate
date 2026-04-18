/**
 * 세션 데이터 읽기 — shared-db로 이전됨 (shim)
 *
 * @deprecated 단일 DB(stargate) 통합 후 registrar_bot DB 구분이 사라졌습니다.
 * shared-db의 sessions CRUD를 직접 사용하세요.
 */

import "./init";

import type { Session, SessionResponse } from "@stargate/shared-db";
import {
  sessionsCol,
  sessionResponsesCol,
  findSessionsByGuildInMonth,
} from "@stargate/shared-db";

export async function findSessionsByMonth(
  guildId: string,
  year: number,
  month: number,
): Promise<Session[]> {
  // month는 1~12 (외부 호출자 기준), 내부 함수는 0~11 month index
  return findSessionsByGuildInMonth(guildId, year, month - 1);
}

export async function findSessionResponses(
  sessionId: string,
): Promise<SessionResponse[]> {
  const col = await sessionResponsesCol();
  return col.find({ sessionId }).sort({ respondedAt: 1 }).toArray();
}

/** userId별 세션 참여 횟수 집계 (YES 응답만 카운트) */
export async function countSessionParticipation(): Promise<
  Record<string, number>
> {
  const col = await sessionResponsesCol();
  const responses = await col
    .find({ status: "YES" })
    .project({ userId: 1 })
    .toArray();

  const counts: Record<string, number> = {};
  for (const r of responses) {
    const uid = r.userId as string;
    counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
}

export async function findUpcomingSessions(
  guildId: string,
  limit = 3,
): Promise<Session[]> {
  const col = await sessionsCol();

  return col
    .find({
      guildId,
      status: "OPEN",
      targetDateTime: { $gte: new Date() },
    })
    .sort({ targetDateTime: 1 })
    .limit(limit)
    .toArray();
}
