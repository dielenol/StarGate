/**
 * 길드 멤버 목록 조회 (Gateway opcode 8 rate limit 완화)
 *
 * `guild.members.fetch()`는 길드당 짧은 시간에 여러 번 호출되면 GatewayRateLimitError가 나고,
 * Discord.js가 Client `error` 이벤트로 던져 프로세스가 종료될 수 있습니다.
 * 캐시·전체 캐시 히트·길드별 최소 요청 간격·재시도·만료 캐시 폴백으로 완화합니다.
 *
 * @module utils/guild-members
 */

import type { Collection, Guild, GuildMember } from "discord.js";
import { L } from "../constants/registrar-voice.js";

/** 정상 캐시 TTL */
const CACHE_TTL_MS = 300_000; // 5분
/** 같은 길드에 대해 실제 Gateway 멤버 요청 사이 최소 간격 (Discord 제한 완화) */
const MIN_GAP_BETWEEN_GATEWAY_FETCH_MS = 65_000;

const cache = new Map<
  string,
  { members: Collection<string, GuildMember>; expiresAt: number }
>();
const inflight = new Map<
  string,
  Promise<Collection<string, GuildMember>>
>();
/** 길드별 마지막 실제 members.fetch() 완료 시각 */
const lastGatewayFetchAt = new Map<string, number>();

function isGatewayRateLimitError(
  err: unknown
): err is { name?: string; data?: { retry_after?: number } } {
  const e = err as { name?: string; data?: { retry_after?: number } };
  return (
    e?.name === "GatewayRateLimitError" ||
    typeof e?.data?.retry_after === "number"
  );
}

/**
 * Gateway 요청 없이 캐시만으로 전원이 잡혀 있는지 (대형 길드는 보통 false)
 */
function getCompleteMemberCache(
  guild: Guild
): Collection<string, GuildMember> | null {
  const { memberCount, members } = guild;
  if (memberCount < 1) return members.cache;
  if (members.cache.size >= memberCount) return members.cache;
  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForMinGap(guildId: string): Promise<void> {
  const last = lastGatewayFetchAt.get(guildId) ?? 0;
  const elapsed = Date.now() - last;
  const need = MIN_GAP_BETWEEN_GATEWAY_FETCH_MS - elapsed;
  if (need > 0) {
    console.warn(L.guildGap(guildId, need / 1000));
    await sleep(need);
  }
}

async function fetchGuildMembersWithRetry(
  guild: Guild,
  maxAttempts = 10
): Promise<Collection<string, GuildMember>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await waitForMinGap(guild.id);
      const col = await guild.members.fetch();
      lastGatewayFetchAt.set(guild.id, Date.now());
      return col;
    } catch (err) {
      if (!isGatewayRateLimitError(err)) throw err;
      const retrySec = err.data?.retry_after ?? 5;
      const waitMs = Math.ceil(retrySec * 1000) + 1000;
      console.warn(
        L.guildRl(guild.id, waitMs / 1000, attempt, maxAttempts)
      );
      if (attempt === maxAttempts) throw err;
      await sleep(waitMs);
    }
  }
  throw new Error(L.guildExhaust);
}

/**
 * 길드 전체 멤버를 조회합니다. 짧은 시간 내 동일 길드는 캐시를 재사용합니다.
 */
export async function fetchGuildMembersCached(
  guild: Guild
): Promise<Collection<string, GuildMember>> {
  const id = guild.id;
  const now = Date.now();

  const complete = getCompleteMemberCache(guild);
  if (complete) {
    cache.set(id, { members: complete, expiresAt: now + CACHE_TTL_MS });
    return complete;
  }

  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) {
    return hit.members;
  }

  const existing = inflight.get(id);
  if (existing) return existing;

  const staleFallback = hit?.members ?? null;

  const promise = (async () => {
    try {
      const members = await fetchGuildMembersWithRetry(guild);
      cache.set(id, { members, expiresAt: Date.now() + CACHE_TTL_MS });
      return members;
    } catch (err) {
      if (staleFallback) {
        console.warn(L.guildStale(id));
        return staleFallback;
      }
      throw err;
    }
  })().finally(() => {
    inflight.delete(id);
  });

  inflight.set(id, promise);
  return promise;
}
