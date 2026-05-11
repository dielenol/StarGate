/**
 * 디스코드 길드 멤버 → `trpg_guild_members` 컬렉션 동기화 서비스
 *
 * - ClientReady 시 `syncAllGuildMembers` 로 전체 fetch + reconcile.
 * - GuildMemberAdd / GuildMemberUpdate 이벤트 시 `upsertGuildMemberFromDiscord`.
 * - GuildMemberRemove 이벤트 시 `markGuildMemberLeftFromDiscord`.
 *
 * `displayName` 은 nickname → globalName → username 폴백.
 * 봇/시스템 계정은 동기화 대상에서 제외.
 *
 * @module services/member-sync
 */

import {
  listActiveTrpgGuildMembers,
  markTrpgGuildMemberLeft,
  upsertTrpgGuildMember,
} from "@stargate/shared-db";

import type { Client, GuildMember } from "discord.js";

/** 일일 재동기화 인터벌 — 24h */
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000;

/** displayName 폴백 — nickname → globalName → username */
function resolveDisplayName(member: GuildMember): string {
  return (
    member.nickname ??
    member.user.globalName ??
    member.user.username
  );
}

/**
 * 길드 전체 멤버를 fetch 해 DB 와 reconcile 한다.
 *
 * - 디스코드에 존재하는 멤버: upsert (봇 제외).
 * - DB 에는 있지만 디스코드에 없는 멤버: `leftAt` 마킹.
 *
 * 반환: `upserted` (활성 멤버 upsert 개수), `markedLeft` (이탈 마킹 개수).
 */
export async function syncAllGuildMembers(
  client: Client,
  guildId: string,
): Promise<{ upserted: number; markedLeft: number }> {
  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const now = new Date();
  const seenDiscordIds = new Set<string>();
  let upserted = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    seenDiscordIds.add(member.user.id);

    await upsertTrpgGuildMember({
      guildId,
      discordUserId: member.user.id,
      discordUsername: member.user.username,
      displayName: resolveDisplayName(member),
      joinedAt: member.joinedAt ?? now,
      lastSyncedAt: now,
      leftAt: null,
    });
    upserted += 1;
  }

  // DB 에 있지만 fetch 결과에 없는 멤버는 leftAt 마킹.
  const active = await listActiveTrpgGuildMembers(guildId);
  let markedLeft = 0;
  for (const cached of active) {
    if (seenDiscordIds.has(cached.discordUserId)) continue;
    const ok = await markTrpgGuildMemberLeft(
      guildId,
      cached.discordUserId,
      now,
    );
    if (ok) markedLeft += 1;
  }

  return { upserted, markedLeft };
}

/**
 * GuildMemberAdd / GuildMemberUpdate 이벤트 핸들러용 단일 멤버 upsert.
 *
 * 봇/시스템 계정 호출 차단은 호출처(index.ts) 책임.
 */
export async function upsertGuildMemberFromDiscord(
  member: GuildMember,
): Promise<void> {
  const now = new Date();
  await upsertTrpgGuildMember({
    guildId: member.guild.id,
    discordUserId: member.user.id,
    discordUsername: member.user.username,
    displayName: resolveDisplayName(member),
    joinedAt: member.joinedAt ?? now,
    lastSyncedAt: now,
    leftAt: null,
  });
}

/**
 * GuildMemberRemove 이벤트 핸들러용 단일 멤버 이탈 마킹.
 *
 * DB 캐시에 해당 멤버가 없으면 no-op (markTrpgGuildMemberLeft 가 false 반환).
 */
export async function markGuildMemberLeftFromDiscord(
  guildId: string,
  discordUserId: string,
): Promise<void> {
  await markTrpgGuildMemberLeft(guildId, discordUserId, new Date());
}

/**
 * 24h 주기로 `syncAllGuildMembers` 를 재호출하는 인터벌을 시작한다.
 * GuildMemberAdd/Remove 이벤트 누락 (게이트웨이 재연결 등) 보정용 안전망.
 *
 * @returns 인터벌 정리 함수 — shutdown 에서 호출.
 */
export function startGuildMemberDailySync(
  client: Client,
  guildId: string,
): () => void {
  const handle = setInterval(() => {
    void syncAllGuildMembers(client, guildId).catch((err) => {
      console.error("[TRPG Bot] 일일 멤버 재동기화 실패:", err);
    });
  }, DAILY_SYNC_MS);
  return () => clearInterval(handle);
}
