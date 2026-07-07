import { NextResponse } from "next/server";

import { applyEquipmentResearchProjectNow } from "@/lib/equipment-shop/research-application";

import { requireResearchGm } from "../_lib";

interface ApplyResearchBody {
  projectId?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireResearchGm();
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
