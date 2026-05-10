/**
 * GM 크레딧 운영 대시보드 — 작전 크레딧 풀 (OPERATION) 상태/조정.
 *
 * GET — { pool: CreditPool | null, exists: boolean }
 *   응답 코드: 401 / 403 / 500.
 *
 * POST — body: { action: "init" | "adjust", amount?, allowNegative?, description? }
 *   - action="init" : 풀이 없으면 OPERATION_POOL_INITIAL_BALANCE 로 부트스트랩.
 *                     이미 존재하면 409 + code "POOL_EXISTS".
 *   - action="adjust": amount(0 아닌 number) 만큼 atomic 가산. 풀 부재 → 404 + "POOL_NOT_FOUND".
 *                     allowNegative=false 인 차감 시 잔액 부족 → 400 + "POOL_INSUFFICIENT".
 *   응답: { pool, action, applied }.
 *
 * description 은 받기만 하고 현 단계에선 보존 위치 없음 (향후 op_pool_audits 컬렉션 추가 시 사용).
 *
 * D2 결정 — 풀 자체 조정은 ledger 트랜잭션 미생성 (봇과 일치).
 *
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import type { CreditPool } from "@/lib/db/credit-pools";
import type { OpPoolDto } from "@/hooks/queries/useCreditsAdminQuery";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_ID,
  OPERATION_POOL_INITIAL_BALANCE,
  addCreditPoolBalance,
  ensureCreditPool,
  getCreditPool,
} from "@/lib/db/credit-pools";

/**
 * shared-db CreditPool (Date 필드) → 클라이언트 DTO (ISO string).
 * NextResponse.json 으로 Date 가 silently 직렬화되면 응답 타입(`Date`) 과
 * 실제 페이로드(string) 가 분기되어 호출처가 `getTime()` 등 호출 시 폭발.
 */
function toOpPoolDto(pool: CreditPool): OpPoolDto {
  return {
    _id: String(pool._id),
    poolId: pool.poolId,
    name: pool.name,
    balance: pool.balance,
    updatedAt: pool.updatedAt.toISOString(),
    createdAt: pool.createdAt.toISOString(),
  };
}

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
    const pool = await getCreditPool(OPERATION_POOL_ID);
    return NextResponse.json(
      { pool: pool ? toOpPoolDto(pool) : null, exists: !!pool },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "작전풀 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PostBody {
  action?: "init" | "adjust";
  amount?: number;
  allowNegative?: boolean;
  /** 향후 감사 기록용 — 현재는 서버에서 무시. */
  description?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as PostBody;

  if (body.action !== "init" && body.action !== "adjust") {
    return NextResponse.json(
      { error: "action은 'init' 또는 'adjust'여야 합니다." },
      { status: 400 },
    );
  }

  if (body.action === "init") {
    try {
      const existing = await getCreditPool(OPERATION_POOL_ID);
      if (existing) {
        return NextResponse.json(
          { error: "작전풀이 이미 초기화되어 있습니다.", code: "POOL_EXISTS" },
          { status: 409 },
        );
      }
      const pool = await ensureCreditPool(
        OPERATION_POOL_ID,
        OPERATION_POOL_DEFAULT_NAME,
        OPERATION_POOL_INITIAL_BALANCE,
      );
      return NextResponse.json(
        {
          pool: toOpPoolDto(pool),
          action: "init",
          applied: OPERATION_POOL_INITIAL_BALANCE,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "작전풀 초기화 실패";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // action === "adjust"
  if (
    typeof body.amount !== "number" ||
    !Number.isFinite(body.amount) ||
    body.amount === 0
  ) {
    return NextResponse.json(
      { error: "amount는 0이 아닌 유한 숫자여야 합니다." },
      { status: 400 },
    );
  }
  const amount = body.amount;

  try {
    const existing = await getCreditPool(OPERATION_POOL_ID);
    if (!existing) {
      return NextResponse.json(
        {
          error: "작전풀이 초기화되지 않았습니다. 먼저 init 을 호출하세요.",
          code: "POOL_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    let updated;
    try {
      updated = await addCreditPoolBalance(OPERATION_POOL_ID, amount, {
        allowNegative: !!body.allowNegative,
      });
    } catch (err) {
      // addCreditPoolBalance 의 가드 실패 (잔액 부족) — Pool insufficient 메시지 패턴.
      if (
        err instanceof Error &&
        err.message.toLowerCase().includes("insufficient")
      ) {
        return NextResponse.json(
          {
            error: "작전풀 잔액이 부족합니다.",
            code: "POOL_INSUFFICIENT",
          },
          { status: 400 },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { pool: toOpPoolDto(updated), action: "adjust", applied: amount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "작전풀 조정 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
