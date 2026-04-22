import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  countUsersByRole,
  findUserById,
  updateUserRole,
} from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";
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
    requireRole(session.user.role, "SUPER_ADMIN");
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

  // 마지막 SUPER_ADMIN 강등 방지 — 남은 SUPER_ADMIN 이 본인 뿐이면 운영 공백 발생
  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const superAdminCount = await countUsersByRole("SUPER_ADMIN");
    if (superAdminCount <= 1) {
      return NextResponse.json(
        { error: "마지막 SUPER_ADMIN은 강등할 수 없습니다." },
        { status: 400 },
      );
    }
  }

  try {
    await updateUserRole(id, role as UserRole);
    console.info("[admin-audit]", {
      action: "USER_ROLE_CHANGE",
      actorId: session.user.id,
      targetId: id,
      newRole: role,
      at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "역할 변경 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
