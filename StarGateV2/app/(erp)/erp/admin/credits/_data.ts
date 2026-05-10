/**
 * /erp/admin/credits 의 서버 컴포넌트가 사용하는 초기 데이터 빌더.
 *
 * P4 의 라우트 (/api/erp/admin/credits/{kpi,balances,log,op-pool}) 와 동일한
 * 비즈니스 로직을 lib/db 직접 호출로 재현해 하이브리드 패턴의 initialData 를 구성한다.
 *
 * 라우트와 코드 중복은 의도적 — 라우트는 클라이언트 useQuery 가 호출하고,
 * 본 빌더는 서버 진입 시 한 번만 호출해 초기 캐시 시드를 만든다.
 */

import type {
  AgentBalanceRow,
  CreditKpiSnapshot,
  CreditTransactionPage,
  SessionRewardCandidate,
} from "@/types/credit-admin";

import {
  findMainCharacterByOwner,
  listAgentCharacters,
} from "@/lib/db/characters";
import { OPERATION_POOL_ID, getCreditPool } from "@/lib/db/credit-pools";
import {
  countCreditTransactionsFiltered,
  getCharacterBalance,
  getCreditsActivity24h,
  listCreditTransactions,
  listCreditTransactionsFiltered,
  sumLatestBalancesByCharacterIds,
} from "@/lib/db/credits";
import { findUserById, listUsers } from "@/lib/db/users";

import type { OpPoolResponse } from "@/hooks/queries/useCreditsAdminQuery";

import type { GrantTargetUser } from "./CreditGrantForm";
import { buildInitialSessionCandidates as buildSessionCandidatesViaHelper } from "./_session-rewards";

const INITIAL_LOG_LIMIT = 50;

/* ── 운영 캐릭 추출 helper ── */

/**
 * 운영 MAIN AGENT 캐릭터만 추출 (isPublic !== false).
 *
 * GM 크레딧 대시보드의 모든 집계/표시 (KPI / 잔액 보드 / 로그 / grantTargets) 는
 * 본 helper 결과를 기준으로 한다 — 테스트 더미(isPublic === false) 캐릭터는
 * 화면에서 제외하고 GM 이 실수로 더미에 발급하는 사고도 차단.
 *
 * 더미의 트랜잭션은 DB 에 그대로 보존 (audit 가치 — 삭제 X). 화면 표시에서만 제외.
 * GM 이 명시적으로 `characterId=<dummy_id>` 단건 필터를 입력한 경우는
 * 그 의도를 존중하고 본 helper 의 화이트리스트는 무시 (log 라우트의 정책).
 */
export async function listPublicMainAgentCharacters() {
  const all = await listAgentCharacters("MAIN");
  return all.filter((c) => c.isPublic !== false);
}

/* ── KPI ── */

export async function buildInitialKpi(): Promise<CreditKpiSnapshot> {
  const mains = await listPublicMainAgentCharacters();
  const ids = mains.map((c) => String(c._id));

  const [balanceAgg, activity24h, opPool] = await Promise.all([
    sumLatestBalancesByCharacterIds(ids),
    getCreditsActivity24h(),
    getCreditPool(OPERATION_POOL_ID),
  ]);

  return {
    totalBalance: balanceAgg.totalBalance,
    activeAgentCount: ids.length,
    totalGranted24h: activity24h.granted,
    totalDeducted24h: activity24h.deducted,
    opPoolBalance: opPool?.balance ?? null,
    opPoolUpdatedAt: opPool?.updatedAt
      ? new Date(opPool.updatedAt).toISOString()
      : null,
    generatedAt: new Date().toISOString(),
  };
}

/* ── Agent Balances 보드 ── */

export async function buildInitialBalances(): Promise<{
  rows: AgentBalanceRow[];
  generatedAt: string;
}> {
  const mains = await listPublicMainAgentCharacters();

  const characterAggregates = await Promise.all(
    mains.map(async (character) => {
      const characterId = String(character._id);
      const [balance, latestTxs] = await Promise.all([
        getCharacterBalance(characterId),
        listCreditTransactions(characterId, 1),
      ]);
      const lastTxAt = latestTxs[0]?.createdAt
        ? new Date(latestTxs[0].createdAt).toISOString()
        : null;
      return { character, balance, lastTxAt };
    }),
  );

  // owner user batch 조회.
  const uniqueOwnerIds = Array.from(
    new Set(
      mains
        .map((c) => c.ownerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const ownerEntries = await Promise.all(
    uniqueOwnerIds.map(async (ownerId) => {
      const user = await findUserById(ownerId);
      return [ownerId, user] as const;
    }),
  );
  const ownerById = new Map(ownerEntries);

  const rows: AgentBalanceRow[] = characterAggregates.map(
    ({ character, balance, lastTxAt }) => {
      const ownerId = character.ownerId ?? null;
      const owner = ownerId ? ownerById.get(ownerId) ?? null : null;

      return {
        characterId: String(character._id),
        characterCodename: character.codename,
        ownerId,
        ownerName: owner
          ? owner.discordUsername ?? owner.displayName ?? null
          : null,
        ownerDiscordId: owner?.discordId ?? null,
        agentLevel: character.agentLevel ?? "U",
        balance,
        lastTxAt,
      };
    },
  );

  rows.sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.characterCodename.localeCompare(b.characterCodename);
  });

  return { rows, generatedAt: new Date().toISOString() };
}

/* ── 초기 로그 페이지 ── */

export async function buildInitialLog(): Promise<CreditTransactionPage> {
  // 운영 캐릭(isPublic !== false) 의 트랜잭션만 노출 — 더미 캐릭의 ledger 는
  // DB 에 보존되지만 GM 대시보드 표시에서는 제외 (log 라우트의 default 동작과 일치).
  const publicMains = await listPublicMainAgentCharacters();
  const characterIds = publicMains.map((c) => String(c._id));
  const filter = { characterIds };
  const [items, total] = await Promise.all([
    listCreditTransactionsFiltered({
      ...filter,
      limit: INITIAL_LOG_LIMIT,
      skip: 0,
    }),
    countCreditTransactionsFiltered(filter),
  ]);

  return {
    items,
    total,
    limit: INITIAL_LOG_LIMIT,
    skip: 0,
    hasMore: items.length < total,
  };
}

/* ── OP 풀 ── */

export async function buildInitialOpPool(): Promise<OpPoolResponse> {
  const pool = await getCreditPool(OPERATION_POOL_ID);
  return {
    pool: pool
      ? {
          _id: String(pool._id),
          poolId: pool.poolId,
          name: pool.name,
          balance: pool.balance,
          updatedAt: pool.updatedAt.toISOString(),
          createdAt: pool.createdAt.toISOString(),
        }
      : null,
    exists: !!pool,
  };
}

/* ── 세션 자동 보상 후보 ── */

const DEFAULT_SESSION_DAYS_BACK = 14;

/**
 * 최근 daysBack 일 내 종료된 세션의 자동 보상 후보 (응답자 status 라벨 포함).
 *
 * GUILD_ID env 미설정 시 빈 배열로 폴백 — 클라이언트 useQuery 가
 * 라우트 호출에서 500 을 받아 에러 표시한다 (서버 진입은 막지 않음).
 */
export async function buildInitialSessionCandidates(
  daysBack: number = DEFAULT_SESSION_DAYS_BACK,
): Promise<SessionRewardCandidate[]> {
  const guildId = process.env.GUILD_ID;
  if (!guildId) return [];
  return buildSessionCandidatesViaHelper(daysBack, guildId);
}

/* ── 발급 폼 타깃 (user → 메인 캐릭) ── */

export async function buildGrantTargets(): Promise<GrantTargetUser[]> {
  // listUsers 는 UserPublic[] (필요 필드만).
  // 메인 캐릭이 없는 user 는 silent drop 금지 — 폼에서 disabled 옵션으로 노출한다.
  // 메인 캐릭이 더미(isPublic === false) 인 user 는 mainCharacterId=null 로 처리해
  // GM 의 발급 사고를 차단 (disabled 옵션으로 표시 — 미등록과 동일 UX).
  const users = await listUsers();

  // 1인 1 MAIN 정합성 위반 시 findMainCharacterByOwner 가 throw — 그 경우 null 처리.
  const targets: GrantTargetUser[] = await Promise.all(
    users.map(async (u) => {
      let main = null;
      try {
        main = await findMainCharacterByOwner(u._id);
      } catch {
        main = null;
      }
      // 더미 캐릭 보유 user 는 mainCharacterId/Codename 을 null 로 흡수.
      // GrantForm 의 ownerOptions 가 mainCharacterId === null 을 disabled 로 표시.
      const publicMain = main && main.isPublic !== false ? main : null;
      return {
        userId: u._id,
        username: u.username,
        displayName: u.displayName,
        mainCharacterId: publicMain ? String(publicMain._id) : null,
        mainCharacterCodename: publicMain?.codename ?? null,
      };
    }),
  );

  return targets;
}
