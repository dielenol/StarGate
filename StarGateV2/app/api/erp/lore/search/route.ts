import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { searchLore } from "@/lib/db/lore-search";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({
      results: [],
      sourceMode: "fallback",
      degradedSources: [],
    });
  }
  if (query.length > 120) {
    return NextResponse.json(
      { error: "검색어는 120자 이하여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const response = await searchLore(query, {
      userId: getOwnedDataViewerId(session.user),
      role: session.user.role,
    });
    return NextResponse.json(
      {
        ...response,
        results: response.results.map((result) => ({
          ...result,
          updatedAt: result.updatedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "로어 통합 검색 실패" },
      { status: 500 },
    );
  }
}
