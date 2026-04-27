import { NextResponse } from "next/server";

import {
  loreSheetSchema,
  playSheetSchema,
} from "@stargate/shared-db";

import type { CharacterTier, CreateCharacterInput } from "@/types/character";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  listAgentCharacters,
  createCharacter,
} from "@/lib/db/characters";

const VALID_TIER_PARAMS = new Set(["MAIN", "MINI", "ALL"]);

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tierParam = searchParams.get("tier");

  try {
    let characters;
    if (tierParam && VALID_TIER_PARAMS.has(tierParam)) {
      // tier 명시 → AGENT 자동 강제 (NPC 제외)
      const tier =
        tierParam === "ALL" ? null : (tierParam as CharacterTier);
      characters = await listAgentCharacters(tier);
    } else {
      // 무필터도 AGENT 카탈로그로 제한한다. personnel 은 /api/erp/personnel 사용.
      characters = await listAgentCharacters(null);
    }

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
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Partial<CreateCharacterInput>;
  const bodyRecord = body as Record<string, unknown>;

  if (!body.codename?.trim()) {
    return NextResponse.json(
      { error: "codename은 필수입니다." },
      { status: 400 },
    );
  }

  if (!/^[A-Z0-9_]+$/.test(body.codename)) {
    return NextResponse.json(
      {
        error:
          "codename은 대문자, 숫자, 언더스코어(_)만 허용됩니다 (예: NPC_JOHN_SMITH)",
      },
      { status: 400 },
    );
  }

  if (body.type !== "AGENT" && body.type !== "NPC") {
    return NextResponse.json(
      { error: "type은 AGENT 또는 NPC여야 합니다." },
      { status: 400 },
    );
  }

  const loreResult = loreSheetSchema.safeParse(bodyRecord.lore);
  if (!loreResult.success) {
    return NextResponse.json(
      { error: "lore sub-document가 유효하지 않습니다." },
      { status: 400 },
    );
  }

  const createPayload: Record<string, unknown> = {
    ...bodyRecord,
    lore: loreResult.data,
  };

  if (body.type === "AGENT") {
    const playResult = playSheetSchema.safeParse(bodyRecord.play);
    if (!playResult.success) {
      return NextResponse.json(
        { error: "AGENT 생성에는 유효한 play sub-document가 필요합니다." },
        { status: 400 },
      );
    }
    createPayload.play = playResult.data;
  } else if (bodyRecord.play !== undefined) {
    return NextResponse.json(
      { error: "NPC 생성 payload에는 play sub-document를 포함할 수 없습니다." },
      { status: 400 },
    );
  } else {
    delete createPayload.play;
  }

  try {
    const character = await createCharacter(
      createPayload as unknown as CreateCharacterInput,
    );
    return NextResponse.json({ character }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
