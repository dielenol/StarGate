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
 * description 은 durable GM 감사 outbox에 사유로 보존한다.
 *
 * D2 결정 — 풀 자체 조정은 ledger 트랜잭션 미생성 (봇과 일치).
 *
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import type { CreditPool } from "@/lib/db/credit-pools";
import type { OpPoolDto } from "@/hooks/queries/useCreditsAdminQuery";

import { auth } from "@/lib/auth/config";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
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
  /** durable GM 감사 알림에 기록할 조정 사유. */
  description?: string;
}

interface OpPoolMutationResponse {
  pool?: OpPoolDto;
  action?: "init" | "adjust";
  applied?: number;
  error?: string;
  code?: string;
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

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as PostBody | null;

  if (body?.action !== "init" && body?.action !== "adjust") {
    return NextResponse.json(
      { error: "action은 'init' 또는 'adjust'여야 합니다." },
      { status: 400 },
    );
  }

  if (
    (body.action === "adjust" &&
      (typeof body.amount !== "number" ||
        !Number.isSafeInteger(body.amount) ||
        body.amount === 0))
  ) {
    return NextResponse.json(
      { error: "amount는 0이 아닌 안전한 정수여야 합니다." },
      { status: 400 },
    );
  }
  if (
    body.action === "adjust" &&
    body.allowNegative !== undefined &&
    typeof body.allowNegative !== "boolean"
  ) {
    return NextResponse.json(
      { error: "allowNegative는 boolean이어야 합니다." },
      { status: 400 },
    );
  }
  if (
    body.action === "adjust" &&
    body.description !== undefined &&
    typeof body.description !== "string"
  ) {
    return NextResponse.json(
      { error: "description은 문자열이어야 합니다." },
      { status: 400 },
    );
  }
  const description =
    body.action === "adjust" && typeof body.description === "string"
      ? body.description.trim()
      : "";
  if (description.length > 1_000) {
    return NextResponse.json(
      { error: "description은 1,000자 이하여야 합니다." },
      { status: 400 },
    );
  }
  const operationInput: PostBody =
    body.action === "init"
      ? { action: "init" }
      : {
          action: "adjust",
          amount: body.amount,
          allowNegative: body.allowNegative ?? false,
          ...(description ? { description } : {}),
        };

  try {
    const operation = await executeEconomicOperationResult<OpPoolMutationResponse>({
      requestId,
      domain: "admin-operation-credit-pool",
      actorId: session.user.id,
      payload: operationInput,
      run: async (dbSession) => {
        if (operationInput.action === "init") {
          const existing = await getCreditPool(OPERATION_POOL_ID, {
            session: dbSession,
          });
          if (existing) {
            return {
              status: 409,
              body: {
                error: "작전풀이 이미 초기화되어 있습니다.",
                code: "POOL_EXISTS",
              },
            };
          }
          const pool = await ensureCreditPool(
            OPERATION_POOL_ID,
            OPERATION_POOL_DEFAULT_NAME,
            OPERATION_POOL_INITIAL_BALANCE,
            { session: dbSession },
          );
          await scheduleGmAdminAudit({
            action: "작전 크레딧 풀 초기화",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `초기 잔액 ${OPERATION_POOL_INITIAL_BALANCE.toLocaleString()} CR`,
            target: OPERATION_POOL_DEFAULT_NAME,
            timestamp: new Date(),
          }, { session: dbSession });
          return {
            status: 200,
            body: {
              pool: toOpPoolDto(pool),
              action: "init",
              applied: OPERATION_POOL_INITIAL_BALANCE,
            },
          };
        }

        const existing = await getCreditPool(OPERATION_POOL_ID, {
          session: dbSession,
        });
        if (!existing) {
          return {
            status: 404,
            body: {
              error: "작전풀이 초기화되지 않았습니다. 먼저 init 을 호출하세요.",
              code: "POOL_NOT_FOUND",
            },
          };
        }
        const amount = operationInput.amount as number;
        let updated: CreditPool;
        try {
          updated = await addCreditPoolBalance(OPERATION_POOL_ID, amount, {
            allowNegative: operationInput.allowNegative === true,
            session: dbSession,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.toLowerCase().includes("insufficient")
          ) {
            return {
              status: 400,
              body: {
                error: "작전풀 잔액이 부족합니다.",
                code: "POOL_INSUFFICIENT",
              },
            };
          }
          throw error;
        }
        await scheduleGmAdminAudit({
          action: "작전 크레딧 풀 조정",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: `${amount > 0 ? "+" : ""}${amount.toLocaleString()} CR · 잔액 ${updated.balance.toLocaleString()} CR`,
          target: OPERATION_POOL_DEFAULT_NAME,
          details: operationInput.description
            ? [{ name: "사유", value: operationInput.description }]
            : undefined,
          timestamp: new Date(),
        }, { session: dbSession });
        return {
          status: 200,
          body: {
            pool: toOpPoolDto(updated),
            action: "adjust",
            applied: amount,
          },
        };
      },
    });
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: {
        "Cache-Control": "no-store",
        ...(operation.replayed ? { "X-Idempotency-Replayed": "true" } : {}),
      },
    });
  } catch (err) {
    if (err instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일한 요청이 처리 중이거나 다른 요청에 사용되었습니다.", code: "DUPLICATE_REQUEST" },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "작전풀 조정 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
