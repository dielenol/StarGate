/**
 * 같은 날짜의 다른 open 세션과 참여자 충돌을 검사한다.
 *
 * `excludeSessionId` 가 주어지면 해당 세션은 비교 대상에서 제외 (PATCH 시 자기 자신과 충돌나는 사고 방지).
 */

import {
  findTrpgSessionsByDate,
  type TrpgSession,
} from "@stargate/shared-db";

export interface ConflictResult {
  hasConflict: boolean;
  conflictedParticipants: string[];
}

export async function checkParticipantConflict(params: {
  guildId: string;
  date: string;
  participantDiscordIds: string[];
  excludeSessionId?: string;
}): Promise<ConflictResult> {
  const { guildId, date, participantDiscordIds, excludeSessionId } = params;

  if (participantDiscordIds.length === 0) {
    return { hasConflict: false, conflictedParticipants: [] };
  }

  const sameDaySessions: TrpgSession[] = await findTrpgSessionsByDate(
    guildId,
    date,
  );

  const requestedSet = new Set(participantDiscordIds);
  const conflicted = new Set<string>();
  for (const session of sameDaySessions) {
    if (excludeSessionId && session._id?.toString() === excludeSessionId) {
      continue;
    }
    if (session.status !== "open") continue;
    for (const pid of session.participantDiscordIds) {
      if (requestedSet.has(pid)) {
        conflicted.add(pid);
      }
    }
  }

  const conflictedParticipants = Array.from(conflicted);
  return {
    hasConflict: conflictedParticipants.length > 0,
    conflictedParticipants,
  };
}
