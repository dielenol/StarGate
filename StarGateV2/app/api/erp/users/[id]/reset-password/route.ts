import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { findUserById, resetUserPassword } from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
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
      { error: "자신의 비밀번호는 프로필에서 변경하세요." },
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

  // TODO(phase2-b): Phase 2-A rename 후 dead code. Phase 2-B에서 권한 분화 시
  // ADMIN/SUPER_ADMIN 구분 재도입하면 이 블록이 다시 의미 있어짐. 현재는 무해.
  // 권한 역전 방지: GM은 최상위 대상 변경 불가
  if (target.role === "GM" && !hasRole(session.user.role, "GM")) {
    return NextResponse.json(
      { error: "상위 역할 사용자는 변경할 수 없습니다." },
      { status: 403 },
    );
  }

  try {
    const { plainPassword } = await resetUserPassword(id);
    // audit 로그에 plainPassword 절대 포함 금지 — actor/target만 기록
    console.info("[admin-audit]", {
      action: "USER_PASSWORD_RESET",
      actorId: session.user.id,
      targetId: id,
      at: new Date().toISOString(),
    });
    return NextResponse.json(
      { plainPassword },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "비밀번호 초기화 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
