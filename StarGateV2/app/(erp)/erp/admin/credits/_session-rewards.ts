/**
 * 세션 자동 보상 — 후보(eligibility) 빌더 헬퍼.
 *
 * `route.ts` (POST/GET) 와 `_data.ts` (initialData 빌더) 가 동일 chain 로직을
 * 공유하기 위해 추출. 라우트는 클라이언트 useQuery 가 호출하고, _data 는
 * 서버 진입 시 한 번만 호출해 초기 캐시 시드를 만든다.
 *
 * `enrichSessions()` 사용 X — MAIN AGENT 필터 부재로 자동 보상 정합성 보장 불가.
 *  대신 본 헬퍼가 1인 1 MAIN 정책 / discordId 매칭 / 멱등(already-rewarded) 까지 라벨링.
 */

import type {
  SessionRespondent,
  SessionRespondentStatus,
  SessionRewardCandidate,
} from "@/types/credit-admin";

import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { listChangeLogRewardedCharacterIdsBySession } from "@/lib/db/character-points";
import { findTransactionsBySessionMetadata } from "@/lib/db/credits";
import {
  findResponsesBySessionIds,
  findUsersByDiscordIds,
  listRecentCompletedSessions,
} from "@/lib/db/sessions";

const STATUS_KEYS: SessionRespondentStatus[] = [
  "eligible",
  "no-user",
  "no-character",
  "integrity-violation",
  "already-rewarded",
];

export function emptyStatusCounts(): Record<SessionRespondentStatus, number> {
  return {
    eligible: 0,
    "no-user": 0,
    "no-character": 0,
    "integrity-violation": 0,
    "already-rewarded": 0,
  };
}

export interface RawSessionLike {
  _id?: unknown;
  guildId: string;
  title: string;
  targetDateTime: Date;
}

/**
 * 세션 배열 → 자동 보상 후보 (응답자별 status 라벨 + 카운트) 빌드.
 *
 * 단계:
 *  1) 모든 세션의 YES 응답 batch 조회
 *  2) discordId 로 user batch 매핑
 *  3) ownerId 별 메인 캐릭터 조회 (1인 1 MAIN 위반은 throw → integrity-violation)
 *  4) 세션별 자동 보상 트랜잭션 조회 (이미 발급된 character 검출 → already-rewarded)
 *  5) 응답자마다 분기 라벨링
 *
 * silent drop 금지 — 모든 응답자는 status 와 함께 노출된다.
 */
export async function buildSessionRewardCandidates(
  sessions: RawSessionLike[],
): Promise<SessionRewardCandidate[]> {
  const sessionIds = sessions
    .map((s) => (s._id ? String(s._id) : ""))
    .filter((id) => id.length > 0);

  // (1) 모든 세션의 YES 응답.
  const allResponses = await findResponsesBySessionIds(sessionIds);
  const yesResponses = allResponses.filter((r) => r.status === "YES");

  // (2) discordId batch 매핑 (snowflake → user).
  const allDiscordIds = Array.from(
    new Set(yesResponses.map((r) => r.userId).filter((id) => id.length > 0)),
  );
  const users = await findUsersByDiscordIds(allDiscordIds);
  const userByDiscordId = new Map(users.map((u) => [u.discordId!, u]));

  // (3) ownerId 별 메인 캐릭. findMainCharacterByOwner 는 1인 1 MAIN 위반 시 throw.
  type MainEntry =
    | { main: NonNullable<Awaited<ReturnType<typeof findMainCharacterByOwner>>>; integrity: false }
    | { main: null; integrity: false }
    | { main: null; integrity: true };

  const ownerIds = Array.from(new Set(users.map((u) => u._id!.toString())));
  const mainByOwnerId = new Map<string, MainEntry>();
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      try {
        const main = await findMainCharacterByOwner(ownerId);
        if (main) {
          mainByOwnerId.set(ownerId, { main, integrity: false });
        } else {
          mainByOwnerId.set(ownerId, { main: null, integrity: false });
        }
      } catch {
        mainByOwnerId.set(ownerId, { main: null, integrity: true });
      }
    }),
  );

  // (4) 세션별 자동 보상 트랜잭션 batch — 세션마다 1회 호출 (인덱스 partial).
  const rewardedByCharacterBySession = new Map<string, Set<string>>();
  await Promise.all(
    sessionIds.map(async (sid) => {
      const [creditRewarded, changeLogRewarded] = await Promise.all([
        findTransactionsBySessionMetadata(sid),
        listChangeLogRewardedCharacterIdsBySession(sid),
      ]);
      const charSet = new Set([
        ...creditRewarded.map((t) => t.characterId),
        ...changeLogRewarded,
      ]);
      rewardedByCharacterBySession.set(sid, charSet);
    }),
  );

  // 세션별 응답 그룹핑.
  const yesBySessionId = new Map<string, typeof yesResponses>();
  for (const r of yesResponses) {
    const bucket = yesBySessionId.get(r.sessionId);
    if (bucket) bucket.push(r);
    else yesBySessionId.set(r.sessionId, [r]);
  }

  return sessions.map((s) => {
    const sid = s._id ? String(s._id) : "";
    const respondents: SessionRespondent[] = [];
    const counts = emptyStatusCounts();
    const rewardedSet = rewardedByCharacterBySession.get(sid) ?? new Set();

    const sessionResponses = yesBySessionId.get(sid) ?? [];
    for (const r of sessionResponses) {
      const user = userByDiscordId.get(r.userId);
      if (!user) {
        respondents.push({
          discordId: r.userId,
          displayName: r.displayName ?? "(unknown)",
          userId: null,
          ownerId: null,
          characterId: null,
          characterCodename: null,
          status: "no-user",
          reason: "discordId 매칭되는 user 없음",
        });
        counts["no-user"] += 1;
        continue;
      }

      const ownerId = user._id!.toString();
      const mainEntry = mainByOwnerId.get(ownerId);
      if (mainEntry?.integrity) {
        respondents.push({
          discordId: r.userId,
          displayName: r.displayName ?? user.displayName,
          userId: ownerId,
          ownerId,
          characterId: null,
          characterCodename: null,
          status: "integrity-violation",
          reason: "1인 1 MAIN 정책 위반",
        });
        counts["integrity-violation"] += 1;
        continue;
      }
      if (!mainEntry || !mainEntry.main) {
        respondents.push({
          discordId: r.userId,
          displayName: r.displayName ?? user.displayName,
          userId: ownerId,
          ownerId,
          characterId: null,
          characterCodename: null,
          status: "no-character",
          reason: "메인 AGENT 캐릭터 미등록",
        });
        counts["no-character"] += 1;
        continue;
      }

      const characterId = String(mainEntry.main._id);
      if (rewardedSet.has(characterId)) {
        respondents.push({
          discordId: r.userId,
          displayName: r.displayName ?? user.displayName,
          userId: ownerId,
          ownerId,
          characterId,
          characterCodename: mainEntry.main.codename,
          status: "already-rewarded",
          reason: "이 세션의 자동 보상 이력 존재",
        });
        counts["already-rewarded"] += 1;
        continue;
      }

      respondents.push({
        discordId: r.userId,
        displayName: r.displayName ?? user.displayName,
        userId: ownerId,
        ownerId,
        characterId,
        characterCodename: mainEntry.main.codename,
        status: "eligible",
      });
      counts.eligible += 1;
    }

    // 안정적 정렬 — eligible 먼저, 그 다음 라벨 순.
    respondents.sort((a, b) => {
      const ai = STATUS_KEYS.indexOf(a.status);
      const bi = STATUS_KEYS.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return (a.characterCodename ?? a.displayName).localeCompare(
        b.characterCodename ?? b.displayName,
      );
    });

    return {
      sessionId: sid,
      sessionTitle: s.title,
      sessionDate: new Date(s.targetDateTime).toISOString(),
      guildId: s.guildId,
      respondents,
      counts,
    };
  });
}

/**
 * 최근 daysBack 일 (max 60) 내 종료된 세션의 보상 후보 빌드.
 *
 * `_data.ts` 가 서버 진입 시 호출. GUILD_ID env 없으면 빈 배열 반환 (라우트는 500 응답).
 */
export async function buildInitialSessionCandidates(
  daysBack: number,
  guildId: string,
): Promise<SessionRewardCandidate[]> {
  const sessions = await listRecentCompletedSessions(daysBack, guildId);
  if (sessions.length === 0) return [];
  return buildSessionRewardCandidates(sessions);
}
