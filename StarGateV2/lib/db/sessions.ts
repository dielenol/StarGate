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
  countActiveSessionsByGuild,
  findSessionsByGuildInMonth,
  sessionResponsesCol,
  usersCol,
  type ActiveSessionCounts,
  type ResponseStatus,
  type Session as RawSession,
  type SessionResponse,
} from "@stargate/shared-db";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import { getParticipantCodenameOverride } from "@/lib/session-participant-overrides";

import {
  countTrpgActiveSessions,
  fetchTrpgSessionsAsSerialized,
} from "./trpg-sessions-bridge";

export {
  findSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
  countActiveSessionsByGuild,
  countParticipationByUserId,
  countParticipationForUser,
  findResponsesBySessionIds,
  countByStatusBulk,
  findUsersByDiscordIds,
  listCharactersByOwnerIds,
  findSessionsForStartReminder,
  claimSessionStartReminder,
  markSessionStartReminderSent,
  releaseSessionStartReminderClaim,
  // GM 운영 대시보드 — 세션 자동 보상 후보 윈도우 + 단건 조회.
  listRecentCompletedSessions,
  findSessionById,
} from "@stargate/shared-db";

export type { ActiveSessionCounts } from "@stargate/shared-db";

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

      const displayName = r.displayName ?? "(unknown)";
      const userMatch = userByDiscordId.get(r.userId);
      const matchedCodename = userMatch
        ? codenameByOwnerId.get(userMatch.userId)
        : undefined;
      const codename =
        getParticipantCodenameOverride(displayName) ?? matchedCodename;

      return {
        userId: r.userId,
        status: r.status,
        displayName,
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

/**
 * Date / 문자열 / null 가능한 타임스탬프를 안전하게 ISO 문자열로 변환한다.
 *
 * trpg 측은 closeDateTime 이 모델상 없어 빈 문자열로 들어오기도 하고,
 * registra 측에서도 마이그레이션 잔여로 invalid Date 가 섞일 수 있다. `new Date()` 에
 * 그대로 통과시키면 RangeError 가 터지거나 "Invalid Date" 문자열이 직렬화돼 클라이언트로
 * 흘러간다 — 이를 차단하기 위한 폴백 헬퍼.
 */
function safeIso(
  value: Date | string | undefined | null,
  fallback = "",
): string {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/**
 * registra 세션 enrich 결과를 SerializedSession 으로 직렬화한다.
 *
 * page.tsx / API route 양쪽에서 동일하게 사용하던 변환 로직을 단일 출처로 통합.
 * Date → ISO 직렬화 + source: "registra" 주입을 한 곳에서 수행한다.
 */
function serializeEnrichedSessions(
  enriched: EnrichedSession[],
): SerializedSession[] {
  return enriched.map(({ raw: s, participants, counts, myRsvp }) => ({
    _id: s._id?.toString() ?? "",
    guildId: s.guildId,
    channelId: s.channelId,
    messageId: s.messageId,
    title: s.title,
    targetDateTime: safeIso(s.targetDateTime),
    closeDateTime: safeIso(s.closeDateTime),
    targetRoleId: s.targetRoleId,
    status: s.status,
    createdBy: s.createdBy,
    createdAt: safeIso(s.createdAt),
    updatedAt: safeIso(s.updatedAt),
    participants,
    counts,
    myRsvp,
    source: "registra" as const,
  }));
}

/**
 * registra(공식 길드) + trpg(별도 길드) 두 컬렉션의 해당 월 세션을 합쳐
 * 시간순 정렬된 SerializedSession 배열로 반환한다.
 *
 * - 두 fetch 는 `Promise.allSettled` 로 격리 — 한쪽 fetch 가 실패해도 다른 쪽을 그대로
 *   노출한다 (실패 측은 console.error 로 흔적 + 빈 배열 폴백). 통합 캘린더가
 *   한쪽 봇 장애로 통째로 죽지 않게 하기 위한 결정.
 * - TRPG_GUILD_ID 미설정 시 trpg 측은 빈 배열 → registra-only 와 동일.
 *
 * @param guildId registra 측 길드(GUILD_ID). trpg 측 길드는 env 에서 자체 판단.
 * @param year 연
 * @param monthIndex 0-11 (JS Date month index)
 * @param viewerDiscordId 현재 유저 discord id — myRsvp 계산용
 */
export async function findMergedSessionsByGuildInMonth(
  guildId: string,
  year: number,
  monthIndex: number,
  viewerDiscordId?: string | null,
): Promise<SerializedSession[]> {
  const viewer = viewerDiscordId ?? null;

  const [registraRawResult, trpgSerializedResult] = await Promise.allSettled([
    findSessionsByGuildInMonth(guildId, year, monthIndex),
    fetchTrpgSessionsAsSerialized(year, monthIndex, viewer),
  ]);

  if (registraRawResult.status === "rejected") {
    console.error(
      "[findMergedSessions] registra fetch failed",
      registraRawResult.reason,
    );
  }
  if (trpgSerializedResult.status === "rejected") {
    console.error(
      "[findMergedSessions] trpg fetch failed",
      trpgSerializedResult.reason,
    );
  }

  const registraRaw =
    registraRawResult.status === "fulfilled" ? registraRawResult.value : [];
  const trpgSerialized =
    trpgSerializedResult.status === "fulfilled"
      ? trpgSerializedResult.value
      : [];

  const registraEnriched = await enrichSessions(registraRaw, viewer);
  const registraSerialized = serializeEnrichedSessions(registraEnriched);

  // ISO 8601 의 사전식 비교는 시간순과 일치 — 안전하게 localeCompare 사용.
  return [...registraSerialized, ...trpgSerialized].sort((a, b) =>
    a.targetDateTime.localeCompare(b.targetDateTime),
  );
}

/**
 * registra + trpg 통합 활성 세션 카운트.
 *
 * - trpg 모델은 status 가 open / cancelled 2단만이고 완료 상태가 없으므로,
 *   시작 시각이 지난 trpg open 세션은 ERP 표시용 `closed` 에 합산한다.
 * - `all` 은 두 출처의 "전체 활성 세션" 합. trpg 측은 `open + closed + cancel` 을
 *   trpg "전체"로 간주한다.
 * - `mine` 은 양쪽 모두에서 viewer 의 YES/참여 카운트 합.
 * - TRPG_GUILD_ID 미설정 시 trpg 측은 0 카운트 → registra 와 동일.
 *
 * 두 카운트 fetch 는 `Promise.allSettled` 로 격리 — 한쪽 실패해도 다른 쪽 카운트는
 * 정확히 노출된다 (실패 측은 console.error + 0 카운트 폴백).
 */
export async function countMergedActiveSessionsByGuild(
  guildId: string,
  viewerDiscordId?: string | null,
): Promise<ActiveSessionCounts> {
  const viewer = viewerDiscordId ?? null;

  const [registraResult, trpgResult] = await Promise.allSettled([
    countActiveSessionsByGuild(guildId, viewer),
    countTrpgActiveSessions(viewer),
  ]);

  if (registraResult.status === "rejected") {
    console.error(
      "[countMergedActiveSessions] registra failed",
      registraResult.reason,
    );
  }
  if (trpgResult.status === "rejected") {
    console.error(
      "[countMergedActiveSessions] trpg failed",
      trpgResult.reason,
    );
  }

  const registraCounts: ActiveSessionCounts =
    registraResult.status === "fulfilled"
      ? registraResult.value
      : { all: 0, open: 0, closed: 0, cancel: 0, mine: 0 };
  const trpgCounts =
    trpgResult.status === "fulfilled"
      ? trpgResult.value
      : { open: 0, closed: 0, cancel: 0, mine: 0 };

  // trpg 측 "전체" 정의 = open + closed + cancel.
  const trpgAll = trpgCounts.open + trpgCounts.closed + trpgCounts.cancel;
  return {
    all: registraCounts.all + trpgAll,
    open: registraCounts.open + trpgCounts.open,
    closed: registraCounts.closed + trpgCounts.closed,
    cancel: registraCounts.cancel + trpgCounts.cancel,
    mine: registraCounts.mine + trpgCounts.mine,
  };
}
