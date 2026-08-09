import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { getClient } from "@/lib/db/client";
import {
  findUserById,
  updateUserRole,
} from "@/lib/db/users";
import {
  assertCanRemoveActiveGm,
  lockAndReadUserAdminMutation,
  UserAdminInvariantError,
} from "@/lib/db/user-admin-invariant";
import { isValidObjectId } from "@/lib/db/utils";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { USER_ROLES, type UserRole } from "@/types/user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
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
      { error: "자신의 역할은 변경할 수 없습니다." },
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

  let body: { role?: string };
  try {
    body = (await request.json()) as { role?: string };
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 },
    );
  }

  const { role } = body;
  if (!role || !USER_ROLES.includes(role as UserRole)) {
    return NextResponse.json(
      { error: `유효하지 않은 역할: ${role}` },
      { status: 400 },
    );
  }

  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const currentTarget = await lockAndReadUserAdminMutation({
          actorId: session.user.id,
          targetId: id,
          session: mongoSession,
        });
        if (role !== "GM") {
          await assertCanRemoveActiveGm(currentTarget, mongoSession);
        }
        const updated = await updateUserRole(id, role as UserRole, {
          session: mongoSession,
        });
        if (!updated) {
          throw new UserAdminInvariantError("TARGET_NOT_FOUND");
        }
        await scheduleGmAdminAudit({
          action: "사용자 역할 변경",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: `${currentTarget.role} → ${role}`,
          target: `${currentTarget.displayName} (${currentTarget.username})`,
          timestamp: new Date(),
        }, { session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
    await notifyUser({
      userId: id,
      type: "ROLE_CHANGE",
      title: "권한 등급이 변경되었습니다",
      message: `${target.role} → ${role} 등급으로 변경되었습니다.`,
      link: "/erp/account",
    }).catch((error) => {
      console.error("[users] role-change notification failed", error);
    });
    console.info("[admin-audit]", {
      action: "USER_ROLE_CHANGE",
      actorId: session.user.id,
      targetId: id,
      newRole: role,
      at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UserAdminInvariantError) {
      const response = {
        ACTOR_CHANGED: [403, "현재 GM 권한을 다시 확인해 주세요."],
        TARGET_NOT_FOUND: [404, "사용자를 찾을 수 없습니다."],
        LAST_ACTIVE_GM: [400, "마지막 active GM은 강등할 수 없습니다."],
      }[err.code] as [number, string];
      return NextResponse.json({ error: response[1] }, { status: response[0] });
    }
    const message = err instanceof Error ? err.message : "역할 변경 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
