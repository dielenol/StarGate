import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getResearchLabOverview } from "@/lib/db/research-lab-overview";
import {
  applyXenoResearchChoice,
  requireXenoResearchActor,
} from "@/lib/db/xeno-research";
import { getXenoChoiceDefinition } from "@/lib/research/xeno-dialogue";
import type { ResearchChoiceResponse } from "@/types/research";

import {
  guestReadOnlyResponse,
  isResearchLabMutationEnabled,
  researchLabNotActivatedResponse,
  researchLabErrorResponse,
  unauthorizedResearchResponse,
} from "../../_response";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();
  if (session.user.isGuest) return guestReadOnlyResponse();
  if (!(await isResearchLabMutationEnabled())) return researchLabNotActivatedResponse();
  const body = (await request.json().catch(() => null)) as {
    choiceId?: unknown;
  } | null;
  const choiceId =
    typeof body?.choiceId === "string" ? body.choiceId.trim() : "";
  const choice = getXenoChoiceDefinition(choiceId);
  if (!choice) {
    return NextResponse.json(
      { error: "등록된 제노 대화 선택지가 아닙니다.", code: "INVALID_CHOICE" },
      { status: 400 },
    );
  }

  try {
    const overview = await getResearchLabOverview({ userId: session.user.id });
    const isAvailable = overview.xeno?.dialogue.choices.some(
      (candidate) => candidate.choiceId === choice.choiceId,
    );
    if (!isAvailable) {
      return NextResponse.json(
        { error: "현재 장면에서 선택할 수 없는 대사입니다.", code: "CHOICE_NOT_AVAILABLE" },
        { status: 409 },
      );
    }
    const actor = await requireXenoResearchActor(session.user.id);
    const result = await applyXenoResearchChoice({
      actor,
      sceneId: choice.sceneId,
      choiceId: choice.choiceId,
      delta: choice.delta,
    });
    const resolvedChoice = getXenoChoiceDefinition(result.choiceId);
    if (!resolvedChoice || resolvedChoice.sceneId !== choice.sceneId) {
      throw new Error("저장된 제노 관계 선택지를 확인할 수 없습니다.");
    }
    const response: ResearchChoiceResponse = {
      ok: true,
      applied: result.applied,
      relationship: result.view,
      dialogue: {
        playerLine: resolvedChoice.playerLine,
        text: resolvedChoice.response,
        expression: resolvedChoice.expression,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    return researchLabErrorResponse(error, "제노 대화 선택을 반영하지 못했습니다.");
  }
}
