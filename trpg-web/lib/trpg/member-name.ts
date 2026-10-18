import type { TrpgMemberView } from "@/lib/discord/avatar";

export interface CurrentUserIdentity {
  discordId: string;
  /** 로그인 세션의 Discord 이름. 길드 멤버 캐시에 본인이 없을 때의 폴백. */
  name: string | null;
}

/**
 * Discord ID 를 화면에 보일 이름으로 바꾼다.
 * 길드 멤버 캐시(봇이 동기화)에 없으면 — 동기화 전이거나 길드를 떠난 멤버 —
 * 본인은 세션 이름을, 그 외에는 ID 를 괄호로 감싸 돌려준다.
 */
export function resolveMemberName(
  membersById: ReadonlyMap<string, Pick<TrpgMemberView, "displayName">>,
  discordUserId: string,
  currentUser: CurrentUserIdentity,
): string {
  const member = membersById.get(discordUserId);
  if (member) return member.displayName;
  if (discordUserId === currentUser.discordId && currentUser.name) {
    return currentUser.name;
  }
  return `(${discordUserId})`;
}
