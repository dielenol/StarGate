import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listCharacters } from "@/lib/db/characters";
import {
  filterCharacterByClearance,
  getUserClearance,
} from "@/lib/personnel";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clearance = getUserClearance(session.user.role);
    const isGM = hasRole(session.user.role, "GM");
    const characters = await listCharacters();
    // GM 외에는 isPublic=false 캐릭터(테스트 더미 등) 숨김.
    const visible = isGM
      ? characters
      : characters.filter((c) => c.isPublic !== false);
    const filtered = visible.map((character) =>
      filterCharacterByClearance(character, clearance),
    );

    return NextResponse.json(
      { characters: filtered },
      {
        headers: {
          "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "신원조회 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
