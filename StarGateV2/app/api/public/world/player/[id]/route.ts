import { NextResponse } from "next/server";

import { findCharacterById } from "@/lib/db/characters";
import { listCharacterInventoryEntries } from "@/lib/db/inventory";
import {
  isPublicAgentWithSheet,
  toPublicAgentDetail,
} from "@/lib/public-player";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const character = await findCharacterById(id).catch(() => null);

  if (!isPublicAgentWithSheet(character)) {
    return NextResponse.json(
      { error: "Public agent was not found." },
      { status: 404 },
    );
  }

  const inventory = await listCharacterInventoryEntries(id);

  return NextResponse.json(
    { agent: toPublicAgentDetail(character, inventory.entries) },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
