import { NextResponse } from "next/server";

import type { AgentCharacter, Character } from "@stargate/shared-db/types";

import { listAgentCharacters } from "@/lib/db/characters";
import {
  addTeamResearchFunding,
  canApplyEquipmentResearchEffect,
  createEquipmentResearchProject,
  findEquipmentResearchProjectByKey,
  findMissingAppliedEquipmentResearchPrerequisites,
  getOrCreateTeamFundingPool,
  insertEquipmentResearchContribution,
  markTeamFundingPoolStarted,
  rollbackTeamResearchFunding,
  serializeEquipmentResearchContribution,
  serializeEquipmentResearchProject,
  serializeEquipmentResearchTeamFundingPool,
} from "@/lib/db/equipment-research";
import { notifyEquipmentResearchEvent } from "@/lib/discord";
import { clampTeamResearchContribution } from "@/lib/equipment-shop/research-contributions";
import {
  addHours,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
} from "@/lib/equipment-shop/research";

import {
  chargeResearchCredits,
  refundResearchCredits,
  requireResearchUser,
  resolveResearchBudgetCharacter,
} from "../_lib";

interface ContributeResearchBody {
  key?: unknown;
  amount?: unknown;
}

type AgentCharacterWithId = AgentCharacter & {
  _id: NonNullable<AgentCharacter["_id"]>;
};

function isAgentCharacterWithId(
  character: Character | null,
): character is AgentCharacterWithId {
  return character?.type === "AGENT" && Boolean(character._id);
}

function parseContributionAmount(value: unknown): number | null {
  if (!Number.isInteger(value) || typeof value !== "number") return null;
  if (value < 1 || value > 1_000_000) return null;
  return value;
}

export async function POST(request: Request) {
  const authResult = await requireResearchUser();
  if ("response" in authResult) return authResult.response;

  const body = (await request.json().catch(() => null)) as
    | ContributeResearchBody
    | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const requestedAmount = parseContributionAmount(body?.amount);
  const node = key ? getEquipmentResearchNode(key) : null;
  if (!node || requestedAmount === null) {
    return NextResponse.json(
      {
        error: "팀 연구 키 또는 기여 금액이 올바르지 않습니다.",
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }

  const effect = getEquipmentResearchEffect(node, "team");
  if (!effect || !node.allowedScopes.includes("team")) {
    return NextResponse.json(
      {
        error: "해당 연구는 팀 연구 기여를 지원하지 않습니다.",
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }

  const existingProject = await findEquipmentResearchProjectByKey({
    key: node.key,
    scope: "team",
    statuses: ["in_progress", "applying", "applied"],
  });
  if (existingProject) {
    return NextResponse.json(
      {
        error: "이미 시작되었거나 적용된 팀 연구입니다.",
        code: "RESEARCH_ALREADY_STARTED",
      },
      { status: 400 },
    );
  }

  const budgetResult = await resolveResearchBudgetCharacter(
    authResult.session.id,
  );
  if ("response" in budgetResult) return budgetResult.response;

  const targets = (await listAgentCharacters(null)).filter(
    isAgentCharacterWithId,
  );
  if (targets.length === 0) {
    return NextResponse.json(
      {
        error: "연구를 적용할 AGENT 캐릭터가 없습니다.",
        code: "NO_AGENT_TARGETS",
      },
      { status: 400 },
    );
  }
  const targetCharacterIds = targets.map((target) => String(target._id));

  const missingPrerequisites =
    await findMissingAppliedEquipmentResearchPrerequisites({
      node,
      scope: "team",
      targetCharacterIds,
    });
  if (
    missingPrerequisites.requiredTier !== null ||
    missingPrerequisites.keys.length > 0
  ) {
    const reasons = [
      missingPrerequisites.requiredTier
        ? `팀 T${missingPrerequisites.requiredTier} 연구 적용`
        : "",
      missingPrerequisites.keys.length > 0
        ? `${missingPrerequisites.keys.join(", ")} 적용`
        : "",
    ].filter(Boolean);
    return NextResponse.json(
      {
        error: `T${node.tier} ${node.key} 팀 연구는 ${reasons.join(" 및 ")} 후 기여할 수 있습니다.`,
        code: "RESEARCH_PREREQUISITE_MISSING",
      },
      { status: 400 },
    );
  }

  for (const target of targets) {
    const capCheck = await canApplyEquipmentResearchEffect({
      characterId: String(target._id),
      effect,
    });
    if (!capCheck.ok) {
      return NextResponse.json(
        {
          error: `${target.codename}: ${capCheck.reason}`,
          code: "RESEARCH_CAP_REACHED",
        },
        { status: 400 },
      );
    }
  }

  const pool = await getOrCreateTeamFundingPool({
    key: node.key,
    targetCost: node.cost,
  });
  const chargeAmount = clampTeamResearchContribution({
    targetCost: pool.targetCost,
    fundedAmount: pool.fundedAmount,
    requestedAmount,
  });
  if (chargeAmount <= 0) {
    return NextResponse.json(
      {
        error: "이미 목표액이 충족된 팀 연구입니다.",
        code: "RESEARCH_ALREADY_STARTED",
      },
      { status: 400 },
    );
  }

  const chargeResult = await chargeResearchCredits({
    budget: budgetResult.budget,
    amount: chargeAmount,
    description: `팀 연구 기여 — ${node.key} ${node.name}`,
    metadata: {
      source: "equipment_shop_research_contribution",
      projectKey: node.key,
      tier: node.tier,
      scope: "team",
      requestedAmount,
      chargedAmount: chargeAmount,
      targetCost: pool.targetCost,
    },
    session: authResult.session,
  });
  if ("response" in chargeResult) return chargeResult.response;

  const updatedPool = await addTeamResearchFunding({
    poolId: String(pool._id),
    currentFundedAmount: pool.fundedAmount,
    amount: chargeAmount,
  });
  if (!updatedPool) {
    await refundResearchCredits({
      budget: budgetResult.budget,
      amount: chargeAmount,
      description: `팀 연구 자동 환불 — ${node.key} 기여 충돌`,
      metadata: {
        source: "equipment_shop_research_contribution_refund",
        projectKey: node.key,
        reason: "funding_conflict",
      },
      session: authResult.session,
    });
    return NextResponse.json(
      {
        error: "동시에 다른 기여가 처리되었습니다. 다시 시도해 주세요.",
        code: "RESEARCH_FUNDING_CONFLICT",
      },
      { status: 409 },
    );
  }

  const contribution = await insertEquipmentResearchContribution({
    scope: "team",
    action: "fund",
    projectKey: node.key,
    contributorCharacterId: budgetResult.budget.id,
    contributorCodename: budgetResult.budget.codename,
    amount: chargeAmount,
  });
  void notifyEquipmentResearchEvent({
    kind: "fund",
    projectKey: node.key,
    contributorCodename: budgetResult.budget.codename,
    amount: chargeAmount,
    fundedAmount: updatedPool.fundedAmount,
    targetCost: updatedPool.targetCost,
  });

  let project = null;
  if (updatedPool.fundedAmount >= updatedPool.targetCost) {
    try {
      const startedAt = new Date();
      project = await createEquipmentResearchProject({
        key: node.key,
        tier: node.tier,
        scope: "team",
        effect,
        cost: node.cost,
        durationHours: node.durationHours,
        startedAt,
        completedAt: addHours(startedAt, node.durationHours),
        targetCharacterIds,
        createdBy: authResult.session.id,
      });
      await markTeamFundingPoolStarted({
        poolId: String(updatedPool._id),
        projectId: String(project._id),
      });
      await insertEquipmentResearchContribution({
        scope: "team",
        action: "start",
        projectKey: node.key,
        projectId: String(project._id),
        contributorCharacterId: budgetResult.budget.id,
        contributorCodename: budgetResult.budget.codename,
        amount: 0,
      });
      void notifyEquipmentResearchEvent({
        kind: "start",
        projectKey: node.key,
        contributorCodename: budgetResult.budget.codename,
        targetCost: updatedPool.targetCost,
        durationHours: node.durationHours,
      });
    } catch (err) {
      await rollbackTeamResearchFunding({
        poolId: String(updatedPool._id),
        amount: chargeAmount,
      });
      await refundResearchCredits({
        budget: budgetResult.budget,
        amount: chargeAmount,
        description: `팀 연구 자동 환불 — ${node.key} 시작 실패`,
        metadata: {
          source: "equipment_shop_research_contribution_refund",
          projectKey: node.key,
          reason: "project_create_failed",
        },
        session: authResult.session,
      });
      const message =
        err instanceof Error ? err.message : "팀 연구 프로젝트 생성 실패";
      return NextResponse.json(
        {
          error: `팀 연구 시작 실패 (자동 환불 시도 완료): ${message}`,
          code: "RESEARCH_START_FAILED",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      pool: serializeEquipmentResearchTeamFundingPool(updatedPool),
      contribution: serializeEquipmentResearchContribution(contribution),
      project: project ? serializeEquipmentResearchProject(project) : null,
      balance: chargeResult.balance,
      chargedAmount: chargeAmount,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
