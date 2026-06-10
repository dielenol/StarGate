import { NextResponse } from "next/server";

import { requireNochichimSyncAuth } from "../../../_lib/auth";
import { consumeCharacterConsumable } from "../../../_lib/snapshots";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function normalizeQuantity(value: unknown): number | null {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, 9999);
}

export async function POST(request: Request, context: RouteContext) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { itemId?: unknown; quantity?: unknown }
    | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const quantity = normalizeQuantity(body?.quantity);

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
