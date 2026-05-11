/**
 * trpg-bot 운영 길드의 디스코드 멤버 캐시 타입
 *
 * 세션 참가자 선택 UI 의 후보 풀로 사용된다. 디스코드 게이트웨이 이벤트
 * 또는 주기적 동기화로 upsert 되며, 탈퇴자는 `leftAt` 으로 soft delete.
 *
 * 입력 페이로드(`UpsertTrpgGuildMemberInput`) 는
 * `schemas/trpg-guild-member.schema.ts` 에서 Zod 스키마 + `z.infer` 로 단일 출처 관리.
 *
 * @module types/trpg-guild-member
 */

import type { ObjectId } from "mongodb";

/** DB 에 저장되는 trpg 길드 멤버 문서 */
export interface TrpgGuildMember {
  _id?: ObjectId;
  guildId: string;
  discordUserId: string;
  /** 디스코드 username (글로벌 로그인 ID) */
  discordUsername: string;
  /** 표기용 이름: nickname → globalName → username 폴백 */
  displayName: string;
  joinedAt: Date;
  /** 길드 이탈 시각 (잔류 중이면 null) */
  leftAt: Date | null;
  /** 마지막 동기화 시각 */
  lastSyncedAt: Date;
}
