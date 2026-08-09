import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { getClient } from "@/lib/db/client";
import { findUserById, unlinkDiscord } from "@/lib/db/users";
import {
  lockAndReadUserAdminMutation,
  UserAdminInvariantError,
} from "@/lib/db/user-admin-invariant";
import { isValidObjectId } from "@/lib/db/utils";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

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
      { error: "자신의 Discord 연동은 해제할 수 없습니다." },
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

  // Discord-only 계정 가드: hashedPassword가 없으면 연동 해제 시 로그인 수단 상실
  if (target.hashedPassword == null) {
    return NextResponse.json(
      { error: "비밀번호가 없는 계정은 먼저 비밀번호를 리셋하세요." },
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
        if (currentTarget.hashedPassword == null) {
          throw new Error(
            "비밀번호가 없는 계정은 먼저 비밀번호를 리셋하세요.",
          );
        }
        const unlinked = await unlinkDiscord(id, { session: mongoSession });
        if (!unlinked) throw new Error("사용자를 찾을 수 없습니다.");
        await scheduleGmAdminAudit({
          action: "사용자 Discord 연동 해제",
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
            role: session.user.role,
          },
          summary: "Discord 계정 연결 해제",
          target: `${currentTarget.displayName} (${currentTarget.username})`,
          timestamp: new Date(),
        }, { session: mongoSession });
      });
    } finally {
      await mongoSession.endSession();
    }
    await notifyUser({
      userId: id,
      type: "SYSTEM",
      title: "Discord 연동이 해제되었습니다",
      message: "운영자가 계정의 Discord 연동을 해제했습니다.",
      link: "/erp/account",
    }).catch((error) => {
      console.error("[users] Discord-unlink notification failed", error);
    });
    console.info("[admin-audit]", {
      action: "USER_DISCORD_UNLINK",
      actorId: session.user.id,
      targetId: id,
      at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UserAdminInvariantError) {
      const response = {
        ACTOR_CHANGED: [403, "현재 GM 권한을 다시 확인해 주세요."],
        TARGET_NOT_FOUND: [404, "사용자를 찾을 수 없습니다."],
        LAST_ACTIVE_GM: [400, "마지막 active GM은 변경할 수 없습니다."],
      }[err.code] as [number, string];
      return NextResponse.json({ error: response[1] }, { status: response[0] });
    }
    const message = err instanceof Error ? err.message : "Discord 연동 해제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
