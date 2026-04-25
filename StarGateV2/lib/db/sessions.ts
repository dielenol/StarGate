/**
 * sessions 관련 re-export 래퍼 + enrich 헬퍼
 *
 * `@stargate/shared-db`의 세션/참여 집계 함수를 import할 때
 * serverless 초기화(`./init`) 사이드이펙트를 함께 보장한다.
 *
 * 신규 호출처는 반드시 이 모듈을 경유할 것.
 */

import "./init";

import {
  charactersCol,
  sessionResponsesCol,
  usersCol,
  type ResponseStatus,
  type Session as RawSession,
  type SessionResponse,
} from "@stargate/shared-db";

export {
  findSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
  countParticipationByUserId,
} from "@stargate/shared-db";

/** 참여자 enrich 1행 */
export interface EnrichedParticipant {
  userId: string;
  status: ResponseStatus;
  displayName: string;
  codename?: string;
}

/** 세션 + 참여자/집계/myRsvp 가 부가된 enrich 형태 */
export interface EnrichedSession {
  raw: RawSession;
  participants: EnrichedParticipant[];
  counts: { yes: number; no: number };
  myRsvp: ResponseStatus | null;
}

/**
 * raw 세션 배열에 참여자/카운트/myRsvp 정보를 한 번에 부착한다.
 *
 * - session_responses: `sessionId IN [...]` 단일 쿼리 (실패 시 throw — 이 없이는 participants/counts/myRsvp 모두 의미 없음)
 * - users: responder discordId 단일 쿼리로 ownerId(users._id) 매핑 (실패 시 빈 맵으로 폴백 — codename만 유실)
 * - characters: ownerId 단일 쿼리로 대표 codename 매핑 (실패 시 빈 맵으로 폴백)
 *
 * `viewerDiscordId`가 있으면 myRsvp 를 계산해 넣는다 (없으면 null).
 */
export async function enrichSessions(
  rawSessions: RawSession[],
  viewerDiscordId: string | null,
): Promise<EnrichedSession[]> {
  if (rawSessions.length === 0) return [];

  const sessionIds = rawSessions
    .map((s) => s._id?.toString() ?? "")
    .filter((id) => id.length > 0);

  const responsesColInstance = await sessionResponsesCol();
  const responses: SessionResponse[] =
    sessionIds.length > 0
      ? await responsesColInstance
          .find({ sessionId: { $in: sessionIds } })
          .toArray()
      : [];

  const responderDiscordIds = Array.from(
    new Set(responses.map((r) => r.userId).filter((id) => id.length > 0)),
  );

  // discordId → userId(string) — codename 룩업용
  const userByDiscordId = new Map<string, { userId: string }>();
  if (responderDiscordIds.length > 0) {
    const usersColInstance = await usersCol();
    const userDocs = await usersColInstance
      .find({ discordId: { $in: responderDiscordIds } })
      .project<{ _id: unknown; discordId: string }>({
        _id: 1,
        discordId: 1,
      })
      .toArray()
      .catch((err) => {
        console.error("[enrichSessions] users query failed", err);
        return [];
      });
    for (const u of userDocs) {
      if (!u.discordId) continue;
      userByDiscordId.set(u.discordId, {
        userId: String(u._id),
      });
    }
  }

  // ownerId (users._id string) → codename (대표 1건)
  const ownerIds = Array.from(
    new Set(
      Array.from(userByDiscordId.values()).map((u) => u.userId),
    ),
  );

  const codenameByOwnerId = new Map<string, string>();
  if (ownerIds.length > 0) {
    const charactersColInstance = await charactersCol();
    const characterDocs = await charactersColInstance
      .find({ ownerId: { $in: ownerIds }, type: "AGENT" })
      .project<{ ownerId: string | null; codename: string }>({
        ownerId: 1,
        codename: 1,
      })
      .sort({ updatedAt: -1 })
      .toArray()
      .catch((err) => {
        console.error("[enrichSessions] characters query failed", err);
        return [];
      });
    for (const c of characterDocs) {
      if (!c.ownerId) continue;
      if (!codenameByOwnerId.has(c.ownerId)) {
        codenameByOwnerId.set(c.ownerId, c.codename);
      }
    }
  }

  // sessionId 별 responses 그룹핑
  const bySessionId = new Map<string, SessionResponse[]>();
  for (const r of responses) {
    const bucket = bySessionId.get(r.sessionId);
    if (bucket) bucket.push(r);
    else bySessionId.set(r.sessionId, [r]);
  }

  return rawSessions.map((raw) => {
    const sid = raw._id?.toString() ?? "";
    const sessionResponses = bySessionId.get(sid) ?? [];

    let yes = 0;
    let no = 0;
    let myRsvp: ResponseStatus | null = null;

    const participants: EnrichedParticipant[] = sessionResponses.map((r) => {
      if (r.status === "YES") yes += 1;
      else if (r.status === "NO") no += 1;

      if (viewerDiscordId && r.userId === viewerDiscordId) {
        myRsvp = r.status;
      }

      const userMatch = userByDiscordId.get(r.userId);
      const codename = userMatch
        ? codenameByOwnerId.get(userMatch.userId)
        : undefined;

      return {
        userId: r.userId,
        status: r.status,
        displayName: r.displayName ?? "(unknown)",
        codename,
      };
    });

    return {
      raw,
      participants,
      counts: { yes, no },
      myRsvp,
    };
  });
}
