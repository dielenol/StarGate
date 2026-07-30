import { NextResponse } from "next/server";

import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";

import { requireNochichimSyncAuth } from "../../../_lib/auth";
import {
  consumeCharacterConsumable,
  consumeSharedNochichimConsumable,
  loadCharacterConsumables,
  nochichimSharedConsumableMasterItemId,
  type NochichimConsumptionSessionContext,
} from "../../../_lib/snapshots";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ConsumeBody {
  itemId?: unknown;
  quantity?: unknown;
  session?: unknown;
  sessionId?: unknown;
  sessionTitle?: unknown;
  sessionName?: unknown;
  operationTitle?: unknown;
  requestId?: unknown;
}

function normalizeQuantity(value: unknown): number | null {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, 9999);
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSessionContext(
  body: ConsumeBody | null,
): NochichimConsumptionSessionContext | undefined {
  const nested =
    body?.session && typeof body.session === "object"
      ? (body.session as Record<string, unknown>)
      : {};
  const sessionId = normalizeOptionalString(
    body?.sessionId ?? nested.sessionId ?? nested.id,
  );
  const sessionTitle = normalizeOptionalString(
    body?.sessionTitle ??
      body?.sessionName ??
      body?.operationTitle ??
      nested.title ??
      nested.name,
  );

  if (!sessionId && !sessionTitle) return undefined;
  return { sessionId, sessionTitle };
}

export async function POST(request: Request, context: RouteContext) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as ConsumeBody | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const quantity = normalizeQuantity(body?.quantity);
  const sessionContext = normalizeSessionContext(body);
  const requestId = normalizeOptionalString(body?.requestId);
  const sharedMasterItemId = nochichimSharedConsumableMasterItemId(itemId);

  if (!itemId || quantity === null || (sharedMasterItemId && !requestId)) {
    return NextResponse.json(
      {
        error:
          sharedMasterItemId && !requestId
            ? "requestId is required for shared consumables"
            : "itemId and positive quantity are required",
      },
      { status: 400 },
    );
  }

  try {
    if (sharedMasterItemId) {
      if (quantity !== 1) {
        return NextResponse.json(
          { error: "Shared call ticket quantity must be 1" },
          { status: 400 },
        );
      }
      const characterId = decodeURIComponent(id);
      const operation = await executeEconomicOperationResult<{
        ok: boolean;
        remaining: number;
      }>({
        requestId: `nochichim-shared-consumable:${requestId}`,
        domain: "shared-inventory-consume-vtt",
        actorId: "vtt:nochichim",
        payload: { characterId, itemId, quantity },
        run: async (dbSession) => {
          const result = await consumeSharedNochichimConsumable(
            { characterId, itemId, quantity },
            { session: dbSession },
          );
          return { status: result.ok ? 200 : 409, body: result };
        },
      });
      let consumables;
      try {
        consumables = await loadCharacterConsumables(characterId);
      } catch {
        return NextResponse.json(
          {
            ...operation.body,
            error:
              "Shared consumable operation committed, but inventory refresh failed",
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
      if (!operation.body.ok) {
        return NextResponse.json(
          {
            ...operation.body,
            consumables,
            error: "Insufficient quantity",
          },
          {
            status: operation.status,
            headers: operation.replayed
              ? { "X-Idempotency-Replayed": "true" }
              : undefined,
          },
        );
      }
      return NextResponse.json(
        { ...operation.body, consumables },
        {
          status: operation.status,
          headers: operation.replayed
            ? { "X-Idempotency-Replayed": "true" }
            : undefined,
        },
      );
    }

    const result = await consumeCharacterConsumable({
      characterId: decodeURIComponent(id),
      itemId,
      quantity,
      session: sessionContext,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          remaining: result.remaining,
          consumables: result.consumables,
          error: "Insufficient quantity",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "Shared consumable request is already processing" },
        { status: 409 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to consume item";
    const status = [
      "Character not found",
      "Consumable not found",
      "Shared consumable not found",
    ].includes(message)
      ? 404
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
