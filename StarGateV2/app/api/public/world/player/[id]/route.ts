import { NextResponse } from "next/server";

import { findCharacterById } from "@/lib/db/characters";
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

  return NextResponse.json(
    { agent: toPublicAgentDetail(character) },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
