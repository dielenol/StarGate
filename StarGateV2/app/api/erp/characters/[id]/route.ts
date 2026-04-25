import { NextResponse } from "next/server";

import {
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  PLAYER_ALLOWED_CHARACTER_FIELDS,
} from "@stargate/shared-db";

import type { Character } from "@/types/character";

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

  const character = await findCharacterById(id);
  if (!character) {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 권한 + 모드 결정. admin/player/none 분기.
  const decision = canEditCharacter(
    session.user.id,
    session.user.role,
    character,
  );
  if (decision.mode === "none") {
    return NextResponse.json(
      { error: "Forbidden", reason: decision.reason },
      { status: 403 },
    );
  }

  // 모드별 화이트리스트. admin = 전체, player = 서사 7필드만.
  const allowedFields =
    decision.mode === "admin"
      ? ADMIN_ALLOWED_CHARACTER_FIELDS
      : PLAYER_ALLOWED_CHARACTER_FIELDS;

  const body = (await request.json()) as Partial<
    Omit<Character, "_id" | "createdAt">
  >;

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
