/**
 * 결과 카드·임베드용 멤버 표시 한 줄 (닉네임 우선)
 *
 * @module utils/member-display-line
 */

import type { Collection, GuildMember } from "discord.js";
import type { SessionResponse } from "../types/session.js";

function truncateDisplay(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 응답에 저장된 표시명 우선, 없으면 길드 멤버 캐시 */
export function displayLineForUser(
  userId: string,
  responses: SessionResponse[],
  members: Collection<string, GuildMember>,
  maxLen: number
): string {
  const r = responses.find((x) => x.userId === userId);
  if (r?.displayName?.trim()) {
    return truncateDisplay(r.displayName, maxLen);
  }
  const m = members.get(userId);
  if (m) {
    const n = m.displayName || m.user.username;
    return truncateDisplay(n, maxLen);
  }
  return `유저 …${userId.slice(-6)}`;
}
