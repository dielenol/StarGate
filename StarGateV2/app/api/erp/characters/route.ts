import { NextResponse } from "next/server";

import type { CharacterType, CreateCharacterInput } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  listCharacters,
  listCharactersByType,
  createCharacter,
} from "@/lib/db/characters";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as CharacterType | null;

  try {
    const characters =
      type === "AGENT" || type === "NPC"
        ? await listCharactersByType(type)
        : await listCharacters();

    return NextResponse.json(
      { characters },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "캐릭터 목록 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<CreateCharacterInput>;

  if (!body.codename?.trim()) {
    return NextResponse.json(
      { error: "codename은 필수입니다." },
      { status: 400 },
    );
  }

  if (body.type !== "AGENT" && body.type !== "NPC") {
    return NextResponse.json(
      { error: "type은 AGENT 또는 NPC여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const character = await createCharacter(body as CreateCharacterInput);
    return NextResponse.json({ character }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
