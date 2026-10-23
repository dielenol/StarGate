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

import type { OperatorAlertSink } from "../utils/operator-alerts.js";

import { recordTaskRun } from "../utils/runtime-status.js";

/** 일일 재동기화 인터벌 — 24h */
const DAILY_SYNC_MS = 24 * 60 * 60 * 1000;

/** `recordTaskRun` 에 남기는 작업 이름 — 초기 동기화와 일일 재동기화가 공유 */
const MEMBER_SYNC_TASK_NAME = "member-sync";

/** 전체 동기화가 쓰는 DB 접근 — 테스트에서 가짜로 교체한다. */
export interface MemberSyncDependencies {
  upsert: typeof upsertTrpgGuildMember;
  listActive: typeof listActiveTrpgGuildMembers;
  markLeft: typeof markTrpgGuildMemberLeft;
  recordTaskRun: typeof recordTaskRun;
  now: () => Date;
}

const DEFAULT_DEPENDENCIES: MemberSyncDependencies = {
  upsert: upsertTrpgGuildMember,
  listActive: listActiveTrpgGuildMembers,
  markLeft: markTrpgGuildMemberLeft,
  recordTaskRun,
  now: () => new Date(),
};

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
 * - DB 에는 있지만 디스코드에 없는 멤버: `leftAt` 마킹. 단 동기화 시작 이후
 *   이벤트로 갱신된 멤버(`lastSyncedAt >= startedAt`)는 이탈로 보지 않는다 —
 *   fetch 하는 동안 들어온 신규 멤버를 즉시 탈퇴 처리하는 경합을 막는다.
 * - 성공·실패 모두 `recordTaskRun("member-sync", …)` 로 남긴다.
 *
 * 반환: `upserted` (활성 멤버 upsert 개수), `markedLeft` (이탈 마킹 개수).
 */
export async function syncAllGuildMembers(
  client: Client,
  guildId: string,
  dependencies: Partial<MemberSyncDependencies> = {},
): Promise<{ upserted: number; markedLeft: number }> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const startedAt = deps.now();
  try {
    const guild = await client.guilds.fetch(guildId);
    const members = await guild.members.fetch();

    const now = deps.now();
    const seenDiscordIds = new Set<string>();
    let upserted = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;
      seenDiscordIds.add(member.user.id);

      await deps.upsert({
        guildId,
        discordUserId: member.user.id,
        discordUsername: member.user.username,
        displayName: resolveDisplayName(member),
        discordAvatarUrl: member.displayAvatarURL({ extension: "webp", size: 128 }),
        joinedAt: member.joinedAt ?? now,
        lastSyncedAt: now,
        leftAt: null,
      });
      upserted += 1;
    }

    // DB 에 있지만 fetch 결과에 없는 멤버는 leftAt 마킹 (시작 시각 이전 동기화분만).
    const active = await deps.listActive(guildId);
    let markedLeft = 0;
    for (const cached of active) {
      if (seenDiscordIds.has(cached.discordUserId)) continue;
      const ok = await deps.markLeft(guildId, cached.discordUserId, now, {
        onlyIfSyncedBefore: startedAt,
      });
      if (ok) markedLeft += 1;
    }

    deps.recordTaskRun(MEMBER_SYNC_TASK_NAME, {
      ok: true,
      processed: upserted,
      detail: `markedLeft=${markedLeft}`,
    });
    return { upserted, markedLeft };
  } catch (err) {
    deps.recordTaskRun(MEMBER_SYNC_TASK_NAME, { ok: false, error: err });
    throw err;
  }
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
    discordAvatarUrl: member.displayAvatarURL({ extension: "webp", size: 128 }),
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
 * 실패하면 로그와 함께 운영 알림(`member-daily-sync`)을 보낸다.
 *
 * @returns 인터벌 정리 함수 — shutdown 에서 호출.
 */
export function startGuildMemberDailySync(
  client: Client,
  guildId: string,
  options: {
    operatorAlerts: OperatorAlertSink;
    intervalMs?: number;
    sync?: typeof syncAllGuildMembers;
  },
): () => void {
  const sync = options.sync ?? syncAllGuildMembers;
  const handle = setInterval(() => {
    void sync(client, guildId).catch((err) => {
      console.error("[TRPG Bot] 일일 멤버 재동기화 실패:", err);
      void options.operatorAlerts
        .notify({
          key: "member-daily-sync",
          title: "길드 멤버 일일 재동기화 실패",
          description:
            "운영 길드 멤버 정보를 DB 와 다시 맞추지 못했습니다. 참가자 선택 목록이 최신이 아닐 수 있습니다.",
          severity: "warning",
          error: err,
          context: { 길드: guildId },
        })
        .catch((alertErr) => {
          console.error("[TRPG Bot] 운영 알림 처리 실패:", alertErr);
        });
    });
  }, options.intervalMs ?? DAILY_SYNC_MS);
  return () => clearInterval(handle);
}
