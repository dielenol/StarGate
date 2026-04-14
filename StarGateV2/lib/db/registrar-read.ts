/**
 * registrar_bot DB 읽기 전용 접근
 *
 * registra-bot이 관리하는 세션/응답 데이터를 ERP에서 조회.
 * 쓰기는 봇 전용 — 여기서는 읽기만 수행.
 */

import type { Collection } from "mongodb";

import type { Session, SessionResponse } from "@/types/session";

import { getRegistrarDb } from "./client";

async function sessionsCollection(): Promise<Collection<Session>> {
  const db = await getRegistrarDb();
  return db.collection<Session>("sessions");
}

async function responsesCollection(): Promise<Collection<SessionResponse>> {
  const db = await getRegistrarDb();
  return db.collection<SessionResponse>("session_responses");
}

export async function findSessionsByMonth(
  guildId: string,
  year: number,
  month: number,
): Promise<Session[]> {
  const col = await sessionsCollection();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return col
    .find({
      guildId,
      targetDateTime: { $gte: start, $lt: end },
    })
    .sort({ targetDateTime: 1 })
    .toArray();
}

export async function findSessionResponses(
  sessionId: string,
): Promise<SessionResponse[]> {
  const col = await responsesCollection();
  return col.find({ sessionId }).sort({ respondedAt: 1 }).toArray();
}

/**
 * userId별 세션 참여 횟수 집계 (YES 응답만 카운트)
 */
export async function countSessionParticipation(): Promise<
  Record<string, number>
> {
  const col = await responsesCollection();
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
  const col = await sessionsCollection();

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
