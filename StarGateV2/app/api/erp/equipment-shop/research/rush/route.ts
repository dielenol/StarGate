import { NextResponse } from "next/server";
import { getClient } from "@stargate/shared-db";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import {
  findEquipmentResearchProjectById,
  getEquipmentResearchCapabilities,
  insertEquipmentResearchContribution,
  serializeEquipmentResearchProject,
  updateEquipmentResearchProjectRush,
} from "@/lib/db/equipment-research";
import { notifyEquipmentResearchEvent } from "@/lib/discord";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  isEquipmentResearchEffectOperational,
  quoteEquipmentResearchRush,
} from "@/lib/equipment-shop/research";

import {
  chargeResearchCredits,
  ResearchMutationError,
  requireResearchGm,
  resolveResearchBudgetCharacter,
} from "../_lib";

interface RushResearchBody {
  projectId?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireResearchGm();
  if ("response" in authResult) return authResult.response;

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }

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
  const effect = getEquipmentResearchEffect(node, project.scope) ?? project.effect;
  if (!isEquipmentResearchEffectOperational(effect)) {
    return NextResponse.json(
      {
        error: "후속 기능이 준비되지 않은 연구에는 추가 비용을 사용할 수 없습니다.",
        code: "RESEARCH_NOT_READY",
      },
      { status: 400 },
    );
  }

  const budgetResult = await resolveResearchBudgetCharacter(
    authResult.session.id,
  );
  if ("response" in budgetResult) return budgetResult.response;

  if (
    project.scope === "personal" &&
    !project.targetCharacterIds.includes(budgetResult.budget.id) &&
    authResult.session.role !== "GM"
  ) {
    return NextResponse.json(
      {
        error: "본인 개인 연구만 시간을 단축할 수 있습니다.",
        code: "FORBIDDEN_RESEARCH_PROJECT",
      },
      { status: 403 },
    );
  }

  const capabilities =
    project.scope === "team"
      ? DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES
      : await getEquipmentResearchCapabilities(budgetResult.budget.id);
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

  let balance: number | undefined;
  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
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
          requestId,
          mongoSession,
        });
        const updated = await updateEquipmentResearchProjectRush({
          id: projectId,
          currentRushUsed: project.rushUsed,
          nextCompletedAt: quote.nextCompletedAt,
          discountApplied: quote.discountApplied,
          session: mongoSession,
          requestId,
        });
        if (!updated) throw new ResearchMutationError("RUSH_UPDATE_FAILED", 409, "연구 시간 단축 상태가 충돌했습니다.");
        if (project.scope === "team") {
          await insertEquipmentResearchContribution({
            scope: "team",
            action: "rush",
            projectKey: project.key,
            projectId,
            contributorCharacterId: budgetResult.budget.id,
            contributorCodename: budgetResult.budget.codename,
            amount: quote.cost,
            rushHours: quote.hours,
            requestId,
            session: mongoSession,
          });
        }
        balance = chargeResult.balance;
      });
    } finally {
      await mongoSession.endSession();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "연구 시간 단축 실패";
    return NextResponse.json(
      { error: message, code: err instanceof ResearchMutationError ? err.code : "RUSH_UPDATE_FAILED" },
      { status: err instanceof ResearchMutationError ? err.status : message.includes("duplicate key") ? 409 : 500 },
    );
  }

  const nextProject = await findEquipmentResearchProjectById(projectId);
  if (project.scope === "team") {
    void notifyEquipmentResearchEvent({
      kind: "rush",
      projectKey: project.key,
      contributorCodename: budgetResult.budget.codename,
      amount: quote.cost,
      rushHours: quote.hours,
    });
  }
  scheduleGmAdminAudit({
    action: "장비 연구 가속",
    actor: {
      id: authResult.session.id,
      displayName: authResult.session.displayName,
      role: authResult.session.role,
    },
    summary: `${quote.cost.toLocaleString()} CR · ${quote.hours}시간 단축`,
    target: project.key,
    timestamp: new Date(),
  });
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
      balance,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
