import { NextResponse } from "next/server";

import {
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  PLAYER_ALLOWED_CHARACTER_FIELDS,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { canEditCharacter, requireRole } from "@/lib/auth/rbac";
import {
  findCharacterById,
  updateCharacter,
  deleteCharacter,
} from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const character = await findCharacterById(id);
    if (!character) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ character });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  // 존재 여부와 권한 응답을 통합 — 권한 없는 사용자에게 캐릭터 존재 누설(404 vs 403 oracle) 차단.
  const character = await findCharacterById(id);
  const decision = canEditCharacter(
    session.user.id,
    session.user.role,
    character ?? { ownerId: null },
  );
  if (!character || decision.mode === "none") {
    if (character && decision.mode === "none") {
      console.warn(
        `[characters PATCH] denied user=${session.user.id} character=${id} reason=${decision.reason}`,
      );
    }
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 모드별 화이트리스트. admin = 전체, player = 서사 7필드만.
  const allowedFields =
    decision.mode === "admin"
      ? ADMIN_ALLOWED_CHARACTER_FIELDS
      : PLAYER_ALLOWED_CHARACTER_FIELDS;

  // body 형식은 admin / player 모드에 따라 다름 (sheet 통째 vs sheet 부분객체).
  // 화이트리스트는 shared-db buildUpdatePatch 가 dot path 기준으로 안전 추출.
  const body = (await request.json()) as Record<string, unknown>;

  try {
    const updated = await updateCharacter(id, body, { allowedFields });
    if (!updated) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없거나 변경 사항이 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 수정 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const deleted = await deleteCharacter(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "캐릭터 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
