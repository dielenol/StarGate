import { NextResponse } from "next/server";

import { hasRole } from "@/lib/auth/rbac";
import { findEquipmentResearchProjectById } from "@/lib/db/equipment-research";
import { applyEquipmentResearchProjectNow } from "@/lib/equipment-shop/research-application";
import { canViewerApplyEquipmentResearchProject } from "@/lib/equipment-shop/research";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

import { requireResearchAccess } from "../_lib";

interface ApplyResearchBody {
  projectId?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireResearchAccess();
  if ("response" in authResult) return authResult.response;

  const body = (await request.json().catch(() => null)) as
    | ApplyResearchBody
    | null;
  const projectId =
    typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId가 필요합니다.", code: "INVALID_RESEARCH" },
      { status: 400 },
    );
  }

  const isGm = hasRole(authResult.session.role, "GM");
  if (!isGm) {
    const project = await findEquipmentResearchProjectById(projectId);
    if (
      !project ||
      !canViewerApplyEquipmentResearchProject({
        viewerId: authResult.session.id,
        isGm,
        project,
      })
    ) {
      return NextResponse.json(
        {
          error: "본인이 시작한 개인 연구만 적용할 수 있습니다.",
          code: "FORBIDDEN_RESEARCH_PROJECT",
        },
        { status: 403 },
      );
    }
  }

  try {
    const result = await applyEquipmentResearchProjectNow({
      projectId,
      actor: authResult.session,
    });
    if (!result) {
      return NextResponse.json(
        {
          error: "완료 대기 상태의 연구 프로젝트를 찾을 수 없습니다.",
          code: "RESEARCH_NOT_READY",
        },
        { status: 400 },
      );
    }

    scheduleGmAdminAudit({
      action: "장비 연구 효과 적용",
      actor: {
        id: authResult.session.id,
        displayName: authResult.session.displayName,
        role: authResult.session.role,
      },
      summary: `적용 ${result.affected}명 · 스킵 ${result.skipped}명`,
      target: result.key,
      timestamp: new Date(),
    });

    return NextResponse.json(
      {
        projectId: result.projectId,
        key: result.key,
        effect: result.effect,
        affected: result.affected,
        skipped: result.skipped,
        targets: result.targets,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "연구 적용 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
