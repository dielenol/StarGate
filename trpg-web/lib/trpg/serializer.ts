/**
 * trpg-sessions API 응답 직렬화 유틸.
 *
 * MongoDB ObjectId / Date 를 클라이언트에 안전한 JSON 문자열로 변환한다.
 */

import type { TrpgSession } from "@stargate/shared-db";

/**
 * 클라이언트 노출용 세션 페이로드.
 *
 * 주의: `findTrpgSessionsByMonth` / GET /api/trpg/sessions 는 항상 `status: "open"`
 * 세션만 반환한다 (shared-db crud 계층에서 필터). 클라이언트가 cancelled 세션을
 * 다루지 않도록 타입을 "open" 으로 좁혀 둠. PATCH 응답도 update 성공 시
 * status 가 그대로 open 인 세션이므로 안전.
 */
export interface TrpgSessionView {
  id: string;
  guildId: string;
  title: string;
  date: string;
  startTime: string;
  createdByDiscordId: string;
  createdByUsername: string;
  participantDiscordIds: string[];
  status: "open";
}

export function toTrpgSessionView(session: TrpgSession): TrpgSessionView {
  return {
    id: session._id?.toString() ?? "",
    guildId: session.guildId,
    title: session.title,
    date: session.date,
    startTime: session.startTime,
    createdByDiscordId: session.createdByDiscordId,
    createdByUsername: session.createdByUsername,
    participantDiscordIds: session.participantDiscordIds,
    // GET/PATCH 의 호출 시점에는 항상 open 이지만, 타입 안정성을 위해 명시.
    status: "open",
  };
}
