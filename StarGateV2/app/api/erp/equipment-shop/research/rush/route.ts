import { NextResponse } from "next/server";

import {
  findEquipmentResearchProjectById,
  getEquipmentResearchCapabilities,
  serializeEquipmentResearchProject,
  updateEquipmentResearchProjectRush,
} from "@/lib/db/equipment-research";
import {
  getEquipmentResearchNode,
  quoteEquipmentResearchRush,
} from "@/lib/equipment-shop/research";

import {
  chargeResearchCredits,
  refundResearchCredits,
  requireResearchGm,
  resolveResearchBudgetCharacter,
} from "../_lib";

interface RushResearchBody {
  projectId?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireResearchGm();
  if ("response" in authResult) return authResult.response;

  const body = (await request.json().catch(() => null)) as
    | RushResearchBody
    | null;
  const projectId =
    typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const project = projectId
    ? await findEquipmentResearchProjectById(projectId)
    : null;
  if (!project) {
    return NextResponse.json(
      { error: "연구 프로젝트를 찾을 수 없습니다.", code: "INVALID_RESEARCH" },
      { status: 404 },
    );
  }
  if (project.status !== "in_progress") {
    return NextResponse.json(
      {
        error: "진행 중인 연구만 시간을 단축할 수 있습니다.",
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }

  const node = getEquipmentResearchNode(project.key);
  if (!node) {
    return NextResponse.json(
      { error: "연구 트리에서 프로젝트 키를 찾을 수 없습니다." },
      { status: 409 },
    );
  }

  const budgetResult = await resolveResearchBudgetCharacter(
    authResult.session.id,
  );
  if ("response" in budgetResult) return budgetResult.response;

  const capabilities = await getEquipmentResearchCapabilities(
    budgetResult.budget.id,
  );
  const quote = quoteEquipmentResearchRush({
    node,
    project,
    capabilities,
  });
  if (!quote) {
    return NextResponse.json(
      {
        error: "이 연구는 더 이상 시간을 단축할 수 없습니다.",
        code: "RUSH_LIMIT_REACHED",
      },
      { status: 400 },
    );
  }

  const chargeResult = await chargeResearchCredits({
    budget: budgetResult.budget,
    amount: quote.cost,
    description: `병기 연구 시간 단축 — ${project.key}`,
    metadata: {
      source: "equipment_shop_research_rush",
      projectId,
      projectKey: project.key,
      tier: project.tier,
      rushHours: quote.hours,
      discountApplied: quote.discountApplied,
    },
    session: authResult.session,
  });
  if ("response" in chargeResult) return chargeResult.response;

  const updated = await updateEquipmentResearchProjectRush({
    id: projectId,
    currentRushUsed: project.rushUsed,
    nextCompletedAt: quote.nextCompletedAt,
    discountApplied: quote.discountApplied,
  });
  if (!updated) {
    await refundResearchCredits({
      budget: budgetResult.budget,
      amount: quote.cost,
      description: `병기 연구 자동 환불 — ${project.key} rush 실패`,
      metadata: {
        source: "equipment_shop_research_rush_refund",
        projectId,
        projectKey: project.key,
        reason: "rush_update_failed",
      },
      session: authResult.session,
    });
    return NextResponse.json(
      {
        error: "연구 시간 단축 반영에 실패했습니다. 자동 환불을 시도했습니다.",
        code: "RUSH_UPDATE_FAILED",
      },
      { status: 409 },
    );
  }

  const nextProject = await findEquipmentResearchProjectById(projectId);
  return NextResponse.json(
    {
      project: nextProject
        ? serializeEquipmentResearchProject(nextProject)
        : null,
      rush: {
        cost: quote.cost,
        hours: quote.hours,
        discountApplied: quote.discountApplied,
      },
      balance: chargeResult.balance,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
