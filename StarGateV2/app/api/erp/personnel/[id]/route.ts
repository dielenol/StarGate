import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findCharacterById } from "@/lib/db/characters";
import { isValidObjectId } from "@/lib/db/utils";
import {
  filterCharacterByClearance,
  getUserClearance,
} from "@/lib/personnel";

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

    const clearance = getUserClearance(session.user.role);
    return NextResponse.json({
      character: filterCharacterByClearance(character, clearance),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "신원조회 상세 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
