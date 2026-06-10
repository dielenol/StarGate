import { NextResponse } from "next/server";

import { requireNochichimSyncAuth } from "../../_lib/auth";
import { loadCharacterSnapshot } from "../../_lib/snapshots";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const { id } = await context.params;
  const snapshot = await loadCharacterSnapshot(decodeURIComponent(id));
  if (!snapshot) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  return NextResponse.json({ character: snapshot });
}

