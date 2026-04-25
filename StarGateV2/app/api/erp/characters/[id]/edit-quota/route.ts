/**
 * GET /api/erp/characters/[id]/edit-quota
 *
 * 클라이언트 폼에서 player 모드일 때 남은 편집 횟수와 리셋 시각을 표시하기 위한 조회 API.
 *
 * 응답 형식:
 *   - admin 모드: { mode: 'admin', allowed: true }
 *   - player 모드: { mode: 'player', allowed, used, remaining, resetAt, windowHours, maxCount }
 *
 * 권한/oracle 정책: PATCH 라우트와 동일한 분기.
 *   - 미인증 → 401
 *   - 잘못된 ID → 400
 *   - character 미존재 또는 mode === 'none' → 통합 404 (existence oracle 차단)
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { canEditCharacter } from "@/lib/auth/rbac";
import { checkEditCooldown } from "@/lib/character/cooldown";
import { findCharacterById } from "@/lib/db/characters";
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

  const character = await findCharacterById(id);
  const decision = canEditCharacter(
    session.user.id,
    session.user.role,
    character ?? { ownerId: null },
  );
  if (!character || decision.mode === "none") {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (decision.mode === "admin") {
    return NextResponse.json({ mode: "admin", allowed: true });
  }

  // player 모드 — 실제 쿨다운 상태 조회.
  const status = await checkEditCooldown(session.user.id);
  return NextResponse.json({
    mode: "player",
    allowed: status.allowed,
    used: status.used,
    remaining: status.remaining,
    resetAt: status.resetAt.toISOString(),
    windowHours: status.windowHours,
    maxCount: status.maxCount,
  });
}
