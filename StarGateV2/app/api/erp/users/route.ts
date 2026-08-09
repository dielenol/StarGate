import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { getClient } from "@/lib/db/client";
import { createUser, listUsers } from "@/lib/db/users";
import {
  lockAndAssertActiveGmActor,
  UserAdminInvariantError,
} from "@/lib/db/user-admin-invariant";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { USER_ROLES, type UserRole } from "@/types/user";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json({ users });
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

  const body = await request.json();
  const { username, displayName, role } = body as {
    username?: string;
    displayName?: string;
    role?: string;
  };

  if (!username?.trim() || !displayName?.trim()) {
    return NextResponse.json(
      { error: "username과 displayName은 필수입니다." },
      { status: 400 },
    );
  }

  if (!role || !USER_ROLES.includes(role as UserRole)) {
    return NextResponse.json(
      { error: `유효하지 않은 역할: ${role}` },
      { status: 400 },
    );
  }

  // 자신보다 높거나 같은 역할은 부여 불가
  if (role === "GM" && session.user.role !== "GM") {
    return NextResponse.json(
      { error: "GM 역할은 GM만 부여할 수 있습니다." },
      { status: 403 },
    );
  }

  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    let result: Awaited<ReturnType<typeof createUser>> | null = null;
    try {
      result = await mongoSession.withTransaction(async () => {
        await lockAndAssertActiveGmActor({
          actorId: session.user.id,
          session: mongoSession,
        });
        const created = await createUser(
          {
            username: username.trim(),
            displayName: displayName.trim(),
            role: role as UserRole,
          },
          { session: mongoSession },
        );
        await scheduleGmAdminAudit({
          action: "사용자 계정 생성",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: `${role} 등급 계정 생성`,
          target: `${displayName.trim()} (${username.trim()})`,
          timestamp: new Date(),
        }, { session: mongoSession });
        return created;
      });
    } finally {
      await mongoSession.endSession();
    }
    if (!result) throw new Error("사용자 생성 트랜잭션이 완료되지 않았습니다.");
    await notifyUser({
      userId: result.userId,
      type: "SYSTEM",
      title: "계정이 생성되었습니다",
      message: `${displayName.trim()} 계정이 ${role} 등급으로 등록되었습니다.`,
      link: "/erp/account",
    }).catch((error) => {
      console.error("[users] account-created notification failed", error);
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof UserAdminInvariantError) {
      return NextResponse.json(
        { error: "현재 GM 권한을 다시 확인해 주세요." },
        { status: 403 },
      );
    }
    const message = err instanceof Error ? err.message : "사용자 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
