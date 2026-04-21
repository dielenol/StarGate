/**
 * sessions 관련 re-export 래퍼
 *
 * `@stargate/shared-db`의 세션/참여 집계 함수를 import할 때
 * serverless 초기화(`./init`) 사이드이펙트를 함께 보장한다.
 *
 * 신규 호출처는 반드시 이 모듈을 경유할 것.
 */

import "./init";

export {
  findSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
  countParticipationByUserId,
} from "@stargate/shared-db";
