import { NextResponse } from "next/server";

import "@/lib/db/init";

import {
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_ID,
  OPERATION_POOL_INITIAL_BALANCE,
  addCreditPoolBalance,
  ensureCreditPool,
} from "@stargate/shared-db";

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
  if (!Number.isFinite(parsed)) return null;
  return Math.max(-9999999, Math.min(9999999, Math.trunc(parsed)));
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
    | { mode?: string; value?: unknown; delta?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pool = await ensureOperationPool();
  const mode = body.mode === "adjust" ? "adjust" : "set";
  const delta =
    mode === "adjust"
      ? normalizeCreditDelta(body.delta)
      : (() => {
          const target = normalizeCreditValue(body.value);
          return target === null ? null : target - pool.balance;
        })();

  if (delta === null) {
    return NextResponse.json(
      { error: mode === "adjust" ? "Invalid delta" : "Invalid value" },
      { status: 400 },
    );
  }

  try {
    const nextPool =
      delta === 0
        ? pool
        : await addCreditPoolBalance(OPERATION_POOL_ID, delta, {
            allowNegative: false,
          });
    return NextResponse.json({ operationCredit: serializePool(nextPool) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update operation credit";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
