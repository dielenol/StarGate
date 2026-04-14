import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { createUser, listUsers } from "@/lib/db/users";
import { USER_ROLES, type UserRole } from "@/types/user";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "ADMIN");
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
    requireRole(session.user.role, "ADMIN");
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
  if (role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "SUPER_ADMIN 역할은 SUPER_ADMIN만 부여할 수 있습니다." },
      { status: 403 },
    );
  }

  try {
    const result = await createUser({
      username: username.trim(),
      displayName: displayName.trim(),
      role: role as UserRole,
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "사용자 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
