import { NextResponse } from "next/server";

import { clearCharacterOwnerByUserId } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { getClient } from "@/lib/db/client";
import {
  deleteUser,
  findUserById,
} from "@/lib/db/users";
import {
  assertCanRemoveActiveGm,
  lockAndReadUserAdminMutation,
  UserAdminInvariantError,
} from "@/lib/db/user-admin-invariant";
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

  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    let deletedCount = 0;
    try {
      await mongoSession.withTransaction(async () => {
        const currentTarget = await lockAndReadUserAdminMutation({
          actorId: session.user.id,
          targetId: id,
          session: mongoSession,
        });
        await assertCanRemoveActiveGm(currentTarget, mongoSession);
        await clearCharacterOwnerByUserId(id, { session: mongoSession });
        const deleted = await deleteUser(id, { session: mongoSession });
        deletedCount = deleted.deletedCount;
        if (deletedCount === 0) return;
        await scheduleGmAdminAudit({
          action: "사용자 계정 삭제",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: "계정 삭제 및 캐릭터 소유자 연결 해제",
          target: `${currentTarget.displayName} (${currentTarget.username})`,
          timestamp: new Date(),
        }, { session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
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
    return NextResponse.json({ deletedCount });
  } catch (err) {
    if (err instanceof UserAdminInvariantError) {
      const response = {
        ACTOR_CHANGED: [403, "현재 GM 권한을 다시 확인해 주세요."],
        TARGET_NOT_FOUND: [404, "사용자를 찾을 수 없습니다."],
        LAST_ACTIVE_GM: [400, "마지막 active GM은 삭제할 수 없습니다."],
      }[err.code] as [number, string];
      return NextResponse.json({ error: response[1] }, { status: response[0] });
    }
    const message = err instanceof Error ? err.message : "사용자 삭제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
