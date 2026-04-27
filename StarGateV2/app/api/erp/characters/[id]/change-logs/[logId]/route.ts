/**
 * DELETE /api/erp/characters/[id]/change-logs/[logId]
 *
 * GM 전용 — 단일 change log 삭제. revert 와 다르게 캐릭터 본문은 변경하지 않고
 * audit 기록만 영구 제거한다 (GM 의 명시적 운영 결정 — 잘못된/잡음 entry 정리용).
 *
 * 흐름:
 *   1. auth() — 미인증 401
 *   2. requireRole(GM) — GM 미만 403
 *   3. id / logId 형식 검증 — 400
 *   4. getChangeLogById — 미존재 404
 *   5. log.characterId 와 path id 불일치 — 400 (URL 위변조 차단)
 *   6. deleteChangeLog — 200
 *
 * 멱등: 이미 삭제된 경우 step 4 에서 404 — 클라이언트는 재시도하지 않음.
 *
 * 본 라우트는 의도적으로 cascade 를 수행하지 않는다 — revert 로 생성된 후속 audit row
 * 들은 별개 식별자로 남아 있으며 GM 이 따로 정리한다.
 */

import { NextResponse } from "next/server";

import { deleteChangeLog, getChangeLogById } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ id: string; logId: string }>;
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

  const { id, logId } = await context.params;
  if (!isValidObjectId(id) || !isValidObjectId(logId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const log = await getChangeLogById(logId);
  if (!log) {
    return NextResponse.json(
      { error: "변경 로그를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // path mismatch — 다른 캐릭터 path 로 다른 로그 삭제 시도 차단 (revert 와 동일 가드)
  if (log.characterId.toString() !== id) {
    return NextResponse.json(
      { error: "로그가 해당 캐릭터에 속하지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const deleted = await deleteChangeLog(logId);
    if (!deleted) {
      // step 4 에서 존재 확인했으므로 여기 도달 시 race (다른 GM 이 동시 삭제)
      return NextResponse.json(
        { error: "이미 삭제된 로그입니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "변경 로그 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
