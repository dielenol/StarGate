/**
 * trpg_guild_members CRUD 리포지토리
 *
 * 디스코드 길드 멤버 캐시 — 세션 생성 시 참가자 선택 UI 후보 풀.
 * 게이트웨이 이벤트 또는 주기적 동기화에서 upsert 되며, 탈퇴자는
 * `leftAt` 타임스탬프로 soft delete (재가입 시 leftAt = null 로 복귀).
 *
 * 진입 시점 검증:
 *  - `upsertTrpgGuildMember` 는 Zod 스키마로 입력을 parse 한다.
 *  - 검증 실패 시 `ZodError` 그대로 throw — 호출처에서 로그 + 무시.
 *
 * @module crud/trpg-guild-members
 */

import type { TrpgGuildMember } from "../types/trpg-guild-member.js";

import { trpgGuildMembersCol } from "../collections.js";
import {
  type UpsertTrpgGuildMemberInput,
  upsertTrpgGuildMemberInputSchema,
} from "../schemas/trpg-guild-member.schema.js";

/**
 * 길드 멤버를 upsert 한다.
 *
 * - 이미 존재하면 displayName / username / leftAt / lastSyncedAt 만 갱신.
 * - 신규면 joinedAt 도 setOnInsert 로 박는다 (재가입 시 원본 보존 의도가 아니라
 *   "첫 인입 시각" 의미. 운영상 디스코드 join 이벤트 기반이라 사실상 일치).
 *
 * unique 인덱스: `{ guildId: 1, discordUserId: 1 }`.
 */
export async function upsertTrpgGuildMember(
  member: UpsertTrpgGuildMemberInput,
): Promise<void> {
  // 진입 검증: 잘못된 길이, null 위치 위반을 DB 적재 전에 차단.
  const validated = upsertTrpgGuildMemberInputSchema.parse(member);

  const col = await trpgGuildMembersCol();
  await col.updateOne(
    {
      guildId: validated.guildId,
      discordUserId: validated.discordUserId,
    },
    {
      $set: {
        discordUsername: validated.discordUsername,
        displayName: validated.displayName,
        leftAt: validated.leftAt,
        lastSyncedAt: validated.lastSyncedAt,
      },
      $setOnInsert: {
        guildId: validated.guildId,
        discordUserId: validated.discordUserId,
        joinedAt: validated.joinedAt,
      },
    },
    { upsert: true },
  );
}

/**
 * 길드 내 활성 멤버 목록 (`leftAt: null`) — 참가자 선택 UI 의 후보.
 */
export async function listActiveTrpgGuildMembers(
  guildId: string,
): Promise<TrpgGuildMember[]> {
  const col = await trpgGuildMembersCol();
  return col
    .find({ guildId, leftAt: null })
    .sort({ displayName: 1 })
    .toArray();
}

/** 길드 + 디스코드 ID 로 단일 멤버 조회 (탈퇴자 포함). */
export async function findTrpgGuildMember(
  guildId: string,
  discordUserId: string,
): Promise<TrpgGuildMember | null> {
  const col = await trpgGuildMembersCol();
  return col.findOne({ guildId, discordUserId });
}

/**
 * 멤버 이탈을 기록한다. `leftAt` 을 set + `lastSyncedAt` 동기화.
 *
 * 미존재 멤버에는 영향 없음 (upsert 하지 않음 — 이탈자는 캐시에 존재해야만 의미).
 * 반환값: `true` 이면 한 건이 매칭되어 이탈 기록 적용됨, `false` 이면 캐시에
 * 해당 멤버가 없어 no-op. 호출처가 동기화 누락을 감지하는 데 사용한다.
 *
 * `matchedCount` 기준 — 이미 동일 시각으로 leftAt 이 박혀 있어도 멱등 호출의
 * 성공으로 간주.
 */
export async function markTrpgGuildMemberLeft(
  guildId: string,
  discordUserId: string,
  leftAt: Date,
): Promise<boolean> {
  const col = await trpgGuildMembersCol();
  const result = await col.updateOne(
    { guildId, discordUserId },
    {
      $set: {
        leftAt,
        lastSyncedAt: leftAt,
      },
    },
  );
  return result.matchedCount > 0;
}
