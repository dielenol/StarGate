import { NextResponse } from "next/server";

import "@/lib/db/init";

import {
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_ID,
  OPERATION_POOL_INITIAL_BALANCE,
  addCreditPoolBalance,
  ensureCreditPool,
  setCreditPoolBalance,
} from "@stargate/shared-db";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";

import { requireNochichimSyncAuth } from "../_lib/auth";

export const dynamic = "force-dynamic";

function serializePool(pool: Awaited<ReturnType<typeof ensureCreditPool>>) {
  return {
    poolId: pool.poolId,
    name: pool.name,
    value: pool.balance,
    updatedAt: pool.updatedAt.toISOString(),
  };
}

async function ensureOperationPool() {
  return ensureCreditPool(
    OPERATION_POOL_ID,
    OPERATION_POOL_DEFAULT_NAME,
    OPERATION_POOL_INITIAL_BALANCE,
  );
}

function normalizeCreditValue(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(9999999, Math.trunc(parsed)));
}

function normalizeCreditDelta(value: unknown): number | null {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < -9999999 ||
    parsed > 9999999
  ) {
    return null;
  }
  return parsed;
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
    | { mode?: string; value?: unknown; delta?: unknown; requestId?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "adjust" ? "adjust" : "set";

  if (mode === "set") {
    const value = normalizeCreditValue(body.value);
    if (value === null) {
      return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    }
    try {
      await ensureOperationPool();
      const nextPool = await setCreditPoolBalance(OPERATION_POOL_ID, value);
      return NextResponse.json({ operationCredit: serializePool(nextPool) });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to set operation credit";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const delta = normalizeCreditDelta(body.delta);
  if (delta === null) {
    return NextResponse.json(
      { error: "Invalid delta" },
      { status: 400 },
    );
  }

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

  try {
    await ensureOperationPool();
    const result = await executeEconomicOperationResult({
      requestId,
      domain: "nochichim-operation-credit-adjust",
      actorId: "vtt:nochichim",
      payload: { poolId: OPERATION_POOL_ID, delta },
      run: async (mongoSession) => {
        const nextPool = await addCreditPoolBalance(OPERATION_POOL_ID, delta, {
          allowNegative: false,
          maxBalance: 9999999,
          session: mongoSession,
        });
        return {
          status: 200,
          body: {
            operationCredit: serializePool(nextPool),
            requestId,
            delta,
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
        { error: "같은 requestId 요청을 처리 중이거나 payload가 다릅니다.", code: "DUPLICATE_REQUEST" },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to adjust operation credit";
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
