import { NextResponse } from "next/server";

import { EconomicOperationConflictError } from "@/lib/db/execute-economic-operation";
import { isResearchLabProductionRuntimeReady } from "@/lib/db/research-lab-readiness";
import {
  readXenoRelationshipState,
  requireXenoResearchActor,
} from "@/lib/db/xeno-research";
import { ResearchLabError } from "@/lib/research/research-lab";
import { isResearchLabMutationConfigured } from "@/lib/research/research-lab-readiness";
import {
  buildXenoFixedScene,
  type XenoSceneId,
} from "@/lib/research/xeno-dialogue";
import type { ResearchDialogueMessageView } from "@/types/research";

export function researchLabErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof EconomicOperationConflictError) {
    return NextResponse.json(
      {
        error:
          error.reason === "processing"
            ? "동일한 연구 요청이 처리 중입니다."
            : "동일 Idempotency-Key가 다른 연구 요청에 사용되었습니다.",
        code: "DUPLICATE_REQUEST",
      },
      { status: 409 },
    );
  }
  if (error instanceof ResearchLabError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[research-lab] request failed", error);
  return NextResponse.json(
    { error: fallbackMessage, code: "RESEARCH_LAB_ERROR" },
    { status: 500 },
  );
}

export async function buildResearchActionDialogue(
  userId: string,
  sceneId: XenoSceneId,
): Promise<ResearchDialogueMessageView> {
  const actor = await requireXenoResearchActor(userId);
  const relationshipState = await readXenoRelationshipState(actor);
  return buildXenoFixedScene(sceneId, {
    codename: actor.codename,
    className: actor.className,
    agentLevel: actor.agentLevel,
    relationshipState,
  });
}

export function fallbackResearchActionDialogue(
  sceneId: XenoSceneId,
): ResearchDialogueMessageView {
  return buildXenoFixedScene(sceneId, {
    codename: "RESEARCHER",
    className: "기타",
    relationshipState: "NEUTRAL",
  });
}

export function invalidIdempotencyKeyResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "유효한 Idempotency-Key 헤더가 필요합니다.",
      code: "INVALID_IDEMPOTENCY_KEY",
    },
    { status: 400 },
  );
}

export function unauthorizedResearchResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}

export function guestReadOnlyResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "게스트 미리보기에서는 연구 작업을 실행할 수 없습니다.",
      code: "GUEST_READ_ONLY",
    },
    { status: 403 },
  );
}

export function requireResearchLabMutationConfigured(): void {
  if (isResearchLabMutationConfigured()) return;
  throw new ResearchLabError(
    "RESEARCH_LAB_NOT_ACTIVATED",
    503,
    "연구소 운영 mutation이 아직 활성화되지 않았습니다.",
  );
}

export async function requireResearchLabProductionReady(): Promise<void> {
  if (await isResearchLabProductionRuntimeReady()) return;
  throw new ResearchLabError(
    "RESEARCH_LAB_NOT_ACTIVATED",
    503,
    "연구소 생산 worker가 아직 준비되지 않았습니다.",
  );
}

export function researchLabNotActivatedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "연구소 운영 mutation이 아직 활성화되지 않았습니다.",
      code: "RESEARCH_LAB_NOT_ACTIVATED",
    },
    { status: 503 },
  );
}
