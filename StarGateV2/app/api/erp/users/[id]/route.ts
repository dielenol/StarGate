import { NextResponse } from "next/server";

import { clearCharacterOwnerByUserId } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  countUsersByRole,
  deleteUser,
  findUserById,
} from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

interface RouteContext {
  params: Promise<{ id: string }>;
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
    return NextResponse.json(
      { error: "잘못된 ID 형식입니다." },
      { status: 400 },
    );
  }

  if (session.user.id === id) {
    return NextResponse.json(
      { error: "자신을 삭제할 수 없습니다." },
      { status: 400 },
    );
  }

  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 마지막 GM 삭제 방지
  if (target.role === "GM") {
    const superAdminCount = await countUsersByRole("GM");
    if (superAdminCount <= 1) {
      return NextResponse.json(
        { error: "마지막 GM은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }
  }

  try {
    // characters의 ownerId를 먼저 null로 해제 → user 삭제 순서.
    // 원자성은 없지만 idempotent: 1단계 실패 시 2단계 안 돎, 재시도 안전.
    await clearCharacterOwnerByUserId(id);

    const { deletedCount } = await deleteUser(id);
    if (deletedCount === 0) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    console.info("[admin-audit]", {
      action: "USER_DELETE",
      actorId: session.user.id,
      targetId: id,
      targetUsername: target.username,
      at: new Date().toISOString(),
    });
    scheduleGmAdminAudit({
      action: "사용자 계정 삭제",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: "계정 삭제 및 캐릭터 소유자 연결 해제",
      target: `${target.displayName} (${target.username})`,
      timestamp: new Date(),
    });

    return NextResponse.json({ deletedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "사용자 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
