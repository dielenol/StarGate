import type { TrpgGuildMember, User } from "@stargate/shared-db";

export interface TrpgMemberView {
  discordUserId: string;
  displayName: string;
  discordUsername: string;
  avatarUrl: string;
}

interface TrpgMemberViewOptions {
  linkedUsers?: readonly User[];
  currentUserDiscordId?: string;
  currentUserAvatarUrl?: string | null;
}

const DISCORD_CDN_ORIGIN = "https://cdn.discordapp.com";

function normalizeDiscordCdnUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.origin === DISCORD_CDN_ORIGIN ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Discord 신규 사용자명 계정의 기본 프로필 이미지 인덱스를 snowflake로 계산한다. */
export function getDiscordDefaultAvatarUrl(discordUserId: string): string {
  let avatarIndex = 0;
  if (/^\d+$/.test(discordUserId)) {
    const snowflakeWindow = 6 * 2 ** 22;
    const remainder = Array.from(discordUserId).reduce(
      (value, digit) => (value * 10 + Number(digit)) % snowflakeWindow,
      0,
    );
    avatarIndex = Math.floor(remainder / 2 ** 22);
  }
  return `${DISCORD_CDN_ORIGIN}/embed/avatars/${avatarIndex}.png`;
}

export function toTrpgMemberViews(
  members: readonly TrpgGuildMember[],
  options: TrpgMemberViewOptions = {},
): TrpgMemberView[] {
  const linkedAvatarByDiscordId = new Map(
    (options.linkedUsers ?? []).flatMap((user) => {
      if (!user.discordId) return [];
      const avatarUrl = normalizeDiscordCdnUrl(user.discordAvatar);
      return avatarUrl ? [[user.discordId, avatarUrl] as const] : [];
    }),
  );
  const currentUserAvatarUrl = normalizeDiscordCdnUrl(
    options.currentUserAvatarUrl,
  );

  return members.map((member) => {
    const guildAvatarUrl = normalizeDiscordCdnUrl(member.discordAvatarUrl);
    const sessionAvatarUrl =
      member.discordUserId === options.currentUserDiscordId
        ? currentUserAvatarUrl
        : null;

    return {
      discordUserId: member.discordUserId,
      displayName: member.displayName,
      discordUsername: member.discordUsername,
      avatarUrl:
        guildAvatarUrl ??
        linkedAvatarByDiscordId.get(member.discordUserId) ??
        sessionAvatarUrl ??
        getDiscordDefaultAvatarUrl(member.discordUserId),
    };
  });
}
