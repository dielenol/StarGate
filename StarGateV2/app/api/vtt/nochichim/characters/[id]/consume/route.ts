import { NextResponse } from "next/server";

import { requireNochichimSyncAuth } from "../../../_lib/auth";
import {
  consumeCharacterConsumable,
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

  if (!itemId || quantity === null) {
    return NextResponse.json(
      { error: "itemId and positive quantity are required" },
      { status: 400 },
    );
  }

  try {
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
    const message =
      err instanceof Error ? err.message : "Failed to consume item";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
