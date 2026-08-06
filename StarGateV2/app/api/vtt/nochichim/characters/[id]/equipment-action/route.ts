import { NextResponse } from "next/server";

import { isValidIdempotencyKey } from "@/lib/api/idempotency";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";

import { requireNochichimSyncAuth } from "../../../_lib/auth";
import {
  consumeCharacterEquipmentAction,
  loadCharacterEquippedState,
  prepareCharacterInventoryConsumption,
} from "../../../_lib/snapshots";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface EquipmentActionBody {
  itemId?: unknown;
  actionCode?: unknown;
  requestId?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request, context: RouteContext) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as EquipmentActionBody | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const actionCode = typeof body?.actionCode === "string"
    ? body.actionCode.trim().toUpperCase()
    : "";
  const headerRequestId = optionalString(request.headers.get("Idempotency-Key"));
  const bodyRequestId = optionalString(body?.requestId);
  const requestId = headerRequestId ?? bodyRequestId;
  if (
    !itemId ||
    !/^U[1-9][0-9]?$/.test(actionCode) ||
    !requestId ||
    !isValidIdempotencyKey(requestId) ||
    (headerRequestId !== undefined &&
      bodyRequestId !== undefined &&
      headerRequestId !== bodyRequestId)
  ) {
    return NextResponse.json(
      {
        error:
          "itemId, a valid U actionCode, and a valid matching request id are required",
      },
      { status: 400 },
    );
  }

  try {
    const characterId = await prepareCharacterInventoryConsumption({
      characterKey: decodeURIComponent(id),
      itemId,
    });
    const operation = await executeEconomicOperationResult<
      Awaited<ReturnType<typeof consumeCharacterEquipmentAction>>
    >({
      requestId: `nochichim-equipment-action:${requestId}`,
      domain: "equipment-action-consume-vtt",
      actorId: "vtt:nochichim",
      payload: { characterId, itemId, actionCode },
      run: async (dbSession) => {
        const result = await consumeCharacterEquipmentAction({
          characterId,
          itemId,
          actionCode,
          dbSession,
        });
        return { status: result.ok ? 200 : 409, body: result };
      },
    });
    let equippedState;
    try {
      equippedState = await loadCharacterEquippedState(characterId);
    } catch {
      return NextResponse.json(
        {
          ...operation.body,
          error:
            "Equipment action committed, but the latest equipment state could not be loaded",
          code: "EQUIPMENT_STATE_REFRESH_FAILED",
          retryable: true,
        },
        {
          status: 503,
          headers: operation.replayed
            ? { "X-Idempotency-Replayed": "true" }
            : undefined,
        },
      );
    }
    const responseBody = { ...operation.body, ...equippedState };
    if (!operation.body.ok) {
      return NextResponse.json(
        {
          ...responseBody,
          error:
            "Equipment is unequipped or has insufficient charges or ammunition",
          code: "EQUIPMENT_UNAVAILABLE",
        },
        {
          status: operation.status,
          headers: operation.replayed
            ? { "X-Idempotency-Replayed": "true" }
            : undefined,
        },
      );
    }
    return NextResponse.json(responseBody, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error: "Equipment action request is processing or conflicts",
          code: "OPERATION_CONFLICT",
        },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Equipment action failed";
    const status = ["Character not found", "Equipment action not found"].includes(
      message,
    )
      ? 404
      : message === "Equipment stance action is local-only"
        ? 409
        : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
