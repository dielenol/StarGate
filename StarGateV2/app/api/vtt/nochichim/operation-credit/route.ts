import { NextResponse } from "next/server";

import "@/lib/db/init";

import {
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_ID,
  OPERATION_POOL_INITIAL_BALANCE,
  CreditPoolVersionConflictError,
  addCreditPoolBalance,
  ensureCreditPool,
  setCreditPoolBalance,
} from "@stargate/shared-db";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import { enqueueWorkflowStatusWebhook } from "@/lib/outbox/integration";

import { requireNochichimSyncAuth } from "../_lib/auth";

export const dynamic = "force-dynamic";

function serializePool(pool: Awaited<ReturnType<typeof ensureCreditPool>>) {
  return {
    poolId: pool.poolId,
    name: pool.name,
    value: pool.balance,
    revision: pool.revision ?? 0,
    updatedAt: pool.updatedAt.toISOString(),
  };
}

interface OperationCreditMutationResponse {
  operationCredit?: ReturnType<typeof serializePool>;
  requestId?: string;
  mode?: "adjust" | "set";
  delta?: number;
  value?: number;
  error?: string;
  code?: string;
}

async function ensureOperationPool() {
  return ensureCreditPool(
    OPERATION_POOL_ID,
    OPERATION_POOL_DEFAULT_NAME,
    OPERATION_POOL_INITIAL_BALANCE,
  );
}

function normalizeCreditValue(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 9999999
  ) {
    return null;
  }
  return value;
}

function normalizeCreditDelta(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < -9999999 ||
    value > 9999999
  ) {
    return null;
  }
  return value;
}

export async function GET(request: Request) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const pool = await ensureOperationPool();
  return NextResponse.json({ operationCredit: serializePool(pool) });
}

export async function POST(request: Request) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | {
        mode?: unknown;
        value?: unknown;
        delta?: unknown;
        requestId?: unknown;
        expectedRevision?: unknown;
      }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.mode !== "adjust" && body.mode !== "set") {
    return NextResponse.json(
      { error: "mode must be 'adjust' or 'set'" },
      { status: 400 },
    );
  }
  const mode = body.mode;

  const requestId = readIdempotencyKey(request);
  if (!requestId || body.requestId !== requestId) {
    return NextResponse.json(
      {
        error: "헤더와 본문에 일치하는 유효한 requestId가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const value = mode === "set" ? normalizeCreditValue(body.value) : null;
  if (mode === "set" && value === null) {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }
  const expectedRevision =
    mode === "set" &&
    typeof body.expectedRevision === "number" &&
    Number.isSafeInteger(body.expectedRevision) &&
    body.expectedRevision >= 0
      ? body.expectedRevision
      : null;
  if (
    mode === "set" &&
    expectedRevision === null
  ) {
    return NextResponse.json(
      {
        error: "set에는 GET에서 받은 expectedRevision이 필요합니다.",
        code: "INVALID_EXPECTED_REVISION",
      },
      { status: 400 },
    );
  }

  const delta = mode === "adjust" ? normalizeCreditDelta(body.delta) : null;
  if (mode === "adjust" && delta === null) {
    return NextResponse.json(
      { error: "Invalid delta" },
      { status: 400 },
    );
  }
  const mutationValue = value as number;
  const mutationDelta = delta as number;

  try {
    await ensureOperationPool();
    const result =
      await executeEconomicOperationResult<OperationCreditMutationResponse>({
      requestId,
      domain:
        mode === "adjust"
          ? "nochichim-operation-credit-adjust"
          : "nochichim-operation-credit-set",
      actorId: "vtt:nochichim",
      // 기존 adjust replay의 payload hash를 배포 경계에서도 그대로 보존한다.
      payload:
        mode === "adjust"
          ? { poolId: OPERATION_POOL_ID, delta: mutationDelta }
          : {
              poolId: OPERATION_POOL_ID,
              value: mutationValue,
              expectedRevision,
            },
      run: async (mongoSession) => {
        const before = await ensureCreditPool(
          OPERATION_POOL_ID,
          OPERATION_POOL_DEFAULT_NAME,
          OPERATION_POOL_INITIAL_BALANCE,
          { session: mongoSession },
        );
        let nextPool;
        try {
          nextPool =
            mode === "set"
              ? await setCreditPoolBalance(OPERATION_POOL_ID, mutationValue, {
                  expectedRevision: expectedRevision as number,
                  session: mongoSession,
                })
              : await addCreditPoolBalance(OPERATION_POOL_ID, mutationDelta, {
                  allowNegative: false,
                  maxBalance: 9999999,
                  session: mongoSession,
                });
        } catch (error) {
          if (error instanceof CreditPoolVersionConflictError) {
            return {
              status: 409,
              body: {
                error: "다른 조정이 먼저 반영되었습니다. 최신 잔액을 다시 조회하세요.",
                code: "STALE_OPERATION_CREDIT",
              },
            };
          }
          throw error;
        }
        await enqueueWorkflowStatusWebhook(
          {
            workflow: "OPERATION_CREDIT",
            workflowId: requestId,
            stage: mode === "set" ? "SET" : "ADJUSTED",
            actor: { kind: "BOT", displayName: "NOCHICHIM" },
            summary:
              mode === "set"
                ? `잔액을 ${nextPool.balance.toLocaleString("ko-KR")} CR로 동기화했습니다.`
                : `${mutationDelta > 0 ? "+" : ""}${mutationDelta.toLocaleString("ko-KR")} CR을 반영했습니다.`,
            target: OPERATION_POOL_DEFAULT_NAME,
            details: [
              {
                name: "변경 전",
                value: `${before.balance.toLocaleString("ko-KR")} CR`,
                inline: true,
              },
              {
                name: "변경 후",
                value: `${nextPool.balance.toLocaleString("ko-KR")} CR`,
                inline: true,
              },
            ],
            urlPath: "/erp/admin/credits",
            occurredAt: nextPool.updatedAt,
          },
          `operation-credit:${requestId}:${mode}`,
          { session: mongoSession },
        );
        return {
          status: 200,
          body: {
            operationCredit: serializePool(nextPool),
            requestId,
            mode,
            ...(mode === "adjust"
              ? { delta: mutationDelta }
              : { value: mutationValue }),
          },
        };
      },
    });
    return NextResponse.json(
      { ...result.body, replayed: result.replayed },
      {
        status: result.status,
        headers: result.replayed
          ? { "X-Idempotency-Replayed": "true" }
          : undefined,
      },
    );
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error: "같은 requestId 요청을 처리 중이거나 payload가 다릅니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update operation credit";
    if (message.includes("insufficient")) {
      return NextResponse.json(
        { error: message, code: "INSUFFICIENT_OPERATION_CREDIT" },
        { status: 409 },
      );
    }
    if (message.includes("exceeds maximum balance")) {
      return NextResponse.json(
        { error: message, code: "OPERATION_CREDIT_LIMIT" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
