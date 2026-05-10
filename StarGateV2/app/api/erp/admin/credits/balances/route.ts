/**
 * GM 크레딧 운영 대시보드 — 모든 MAIN AGENT 캐릭터 잔액 보드.
 *
 * 응답: { rows: AgentBalanceRow[]; generatedAt: string }
 * - rows 정렬: balance 내림차순 → codename 오름차순.
 * - owner 정보(ownerName / ownerDiscordId) 비정규화. ownerId 가 null 이면 owner 필드 모두 null.
 *
 * 응답 코드: 401 (미인증) / 403 (GM 미만) / 500 (집계 실패).
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import type { AgentBalanceRow } from "@/types/credit-admin";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { findUserById } from "@/lib/db/users";

import { listPublicMainAgentCharacters } from "@/app/(erp)/erp/admin/credits/_data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 운영 MAIN AGENT (isPublic !== false) 만 잔액 보드에 노출 — 테스트 더미 제외.
    const mainCharacters = await listPublicMainAgentCharacters();

    // 캐릭별 balance + lastTxAt 동시 조회.
    // TODO: balance + lastTxAt 을 batch aggregation 으로 전환 시 N+1 호출 제거.
    // 현재 운영 캐릭 수 50 미만 가정으로 Promise.all 유지.
    const characterAggregates = await Promise.all(
      mainCharacters.map(async (character) => {
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

    // owner user 정보 batch 조회. ownerId 가 null 인 캐릭터는 fetch 자체를 스킵.
    // TODO: lib/db/users 에 batch (ids → users) 함수 신설 시 단일 $in 쿼리로 전환.
    const uniqueOwnerIds = Array.from(
      new Set(
        mainCharacters
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

    return NextResponse.json(
      { rows, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "잔액 보드 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
