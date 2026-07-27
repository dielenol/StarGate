import { findUserById, findUserByUsername } from "./crud/users.js";
import type { User, UserRole } from "./types/user.js";

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

/**
 * 공식 플레이어 테스트 계정의 DM만 GM 운영 계정에 추가 전달한다.
 * 두 ERP 계정의 Discord 연결 자체는 합치지 않아 기존 Registrar 연결을 보존한다.
 */
export const JTEST_DISCORD_DM_MIRROR_RULE = {
  sourceUsername: "JTEST",
  sourceRole: "J",
  targetUsername: "admin",
  targetRole: "GM",
} as const satisfies DiscordDmMirrorRule;

export type DiscordDmRecipientKind = "primary" | "mirror";
export type DiscordDmSourceState = "missing" | "inactive" | "active";

export interface DiscordDmRecipient {
  kind: DiscordDmRecipientKind;
  discordId: string;
}

export interface DiscordDmMirrorRule {
  sourceUsername: string;
  sourceRole?: UserRole;
  targetUsername: string;
  targetRole?: UserRole;
}

export interface DiscordDmRecipientResolution {
  sourceState: DiscordDmSourceState;
  recipients: DiscordDmRecipient[];
}

interface DiscordDmRecipientDependencies {
  findUserById?: (id: string) => Promise<User | null>;
  findUserByUsername?: (username: string) => Promise<User | null>;
}

function linkedDiscordId(user: User): string | null {
  return user.discordId && DISCORD_SNOWFLAKE_PATTERN.test(user.discordId)
    ? user.discordId
    : null;
}

function matchesRole(user: User, requiredRole?: UserRole): boolean {
  return requiredRole === undefined || user.role === requiredRole;
}

export async function resolveDiscordDmRecipients(
  sourceUserId: string,
  options: { mirror?: DiscordDmMirrorRule } = {},
  dependencies: DiscordDmRecipientDependencies = {},
): Promise<DiscordDmRecipientResolution> {
  const findSource = dependencies.findUserById ?? findUserById;
  const source = await findSource(sourceUserId);
  if (!source) {
    return { sourceState: "missing", recipients: [] };
  }
  if (source.status !== "ACTIVE") {
    return { sourceState: "inactive", recipients: [] };
  }

  const recipients: DiscordDmRecipient[] = [];
  const primaryDiscordId = linkedDiscordId(source);
  if (primaryDiscordId) {
    recipients.push({ kind: "primary", discordId: primaryDiscordId });
  }

  const mirror = options.mirror;
  if (
    mirror &&
    source.username === mirror.sourceUsername &&
    matchesRole(source, mirror.sourceRole)
  ) {
    const findTarget =
      dependencies.findUserByUsername ?? findUserByUsername;
    const target = await findTarget(mirror.targetUsername);
    const mirrorDiscordId =
      target &&
      target.status === "ACTIVE" &&
      matchesRole(target, mirror.targetRole)
        ? linkedDiscordId(target)
        : null;
    if (
      mirrorDiscordId &&
      !recipients.some(
        (recipient) => recipient.discordId === mirrorDiscordId,
      )
    ) {
      recipients.push({ kind: "mirror", discordId: mirrorDiscordId });
    }
  }

  return { sourceState: "active", recipients };
}
