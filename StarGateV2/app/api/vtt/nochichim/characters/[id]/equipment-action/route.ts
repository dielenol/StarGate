import { NextResponse } from "next/server";

import { requireNochichimSyncAuth } from "../../../_lib/auth";
import { consumeCharacterEquipmentAction } from "../../../_lib/snapshots";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface EquipmentActionBody {
  itemId?: unknown;
  actionCode?: unknown;
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
  if (!itemId || !/^U[1-9][0-9]?$/.test(actionCode)) {
    return NextResponse.json(
      { error: "itemId and a valid U actionCode are required" },
      { status: 400 },
    );
  }

  try {
    const result = await consumeCharacterEquipmentAction({
      characterId: decodeURIComponent(id),
      itemId,
      actionCode,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ...result, error: "Equipment is unequipped or has insufficient charges" },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Equipment action failed" },
      { status: 404 },
    );
  }
}
