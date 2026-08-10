import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";

/**
 * 공개 게스트용 세션 투영.
 * 일정 자체와 익명 집계는 유지하고 회원/Discord 식별 정보와 개인 RSVP만 제거한다.
 */
export function projectSessionsForGuest(
  sessions: SerializedSession[],
): SerializedSession[] {
  return sessions.map((session) => ({
    ...session,
    guildId: "",
    channelId: "",
    messageId: "",
    participants: [],
    myRsvp: null,
  }));
}
