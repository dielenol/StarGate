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
