/**
 * 무응답자 계산 유틸
 *
 * 역할 기반 대상자 중 응답하지 않은 유저를 추출합니다.
 * @module utils/no-response
 */

import type { Collection, Guild, GuildMember } from "discord.js";
import type { SessionResponse } from "../types/session.js";

/** Discord snowflake 형식 (17~19자리 숫자) */
const SNOWFLAKE_REGEX = /^\d{17,19}$/;

/**
 * roleId가 유효한 Discord snowflake인지 검사합니다.
 * @here, @everyone 등은 역할이 아니므로 false입니다.
 */
function isValidRoleId(value: string): boolean {
  return SNOWFLAKE_REGEX.test(value.trim());
}

/**
 * 역할 멤버 중 응답하지 않은 유저 ID 목록을 반환합니다.
 * @param guild 디스코드 길드
 * @param roleId 대상 역할 ID (snowflake)
 * @param responses 해당 세션의 응답 목록
 * @param members 이미 fetch된 멤버 컬렉션 (rate limit 방지용)
 * @returns 무응답자 유저 ID 배열
 */
export async function getNonResponders(
  guild: Guild,
  roleId: string,
  responses: SessionResponse[],
  members: Collection<string, GuildMember>
): Promise<string[]> {
  if (!isValidRoleId(roleId)) return [];

  const role = await guild.roles.fetch(roleId);
  if (!role) return [];

  // 역할을 가진 멤버 ID 집합
  const memberIds = new Set<string>();
  for (const [, member] of members) {
    if (member.roles.cache.has(roleId)) {
      memberIds.add(member.id);
    }
  }

  // 응답한 유저 ID 집합
  const respondedIds = new Set(responses.map((r) => r.userId));

  // 역할 보유자 중 응답 없는 유저
  const noResponse: string[] = [];
  for (const id of memberIds) {
    if (!respondedIds.has(id)) {
      noResponse.push(id);
    }
  }
  return noResponse;
}
