import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
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
    const characters = await listCharacters();
    const filtered = characters.map((character) =>
      filterCharacterByClearance(character, clearance),
    );

    return NextResponse.json(
      { characters: filtered },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "신원조회 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
