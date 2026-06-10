import { NextResponse } from "next/server";

import { requireNochichimSyncAuth } from "../_lib/auth";
import { listNochichimCharacters } from "../_lib/snapshots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireNochichimSyncAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? undefined;
  const characters = await listNochichimCharacters(query);

  return NextResponse.json({ characters });
}

