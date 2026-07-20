import { NextResponse } from "next/server";

import type { AgentCharacter, Character } from "@stargate/shared-db/types";
import { getClient } from "@stargate/shared-db";

import { childIdempotencyKey, readIdempotencyKey } from "@/lib/api/idempotency";
import { listAgentCharacters } from "@/lib/db/characters";
import {
  addTeamResearchFunding,
  buildEquipmentResearchIdentityKey,
  canApplyEquipmentResearchEffect,
  createEquipmentResearchProject,
  findEquipmentResearchProjectByKey,
  findMissingAppliedEquipmentResearchPrerequisites,
  getOrCreateTeamFundingPool,
  insertEquipmentResearchContribution,
  markTeamFundingPoolStarted,
  requestEquipmentResearchDiscordCardSync,
  serializeEquipmentResearchContribution,
  serializeEquipmentResearchProject,
  serializeEquipmentResearchTeamFundingPool,
} from "@/lib/db/equipment-research";
import { scheduleEquipmentResearchDiscordCardSync } from "@/lib/notifications/equipment-research-discord-schedule";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { clampTeamResearchContribution } from "@/lib/equipment-shop/research-contributions";
import {
  addHours,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  isEquipmentResearchEffectOperational,
} from "@/lib/equipment-shop/research";

import {
  chargeResearchCredits,
  ResearchMutationError,
  requireResearchAccess,
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
  const authResult = await requireResearchAccess();
  if ("response" in authResult) return authResult.response;

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }

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
  if (!isEquipmentResearchEffectOperational(effect)) {
    return NextResponse.json(
      {
        error: "후속 기능이 준비되지 않은 연구에는 아직 기여할 수 없습니다.",
        code: "RESEARCH_NOT_READY",
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

  let transactionResult:
    | {
        balance: number;
        updatedPool: Awaited<ReturnType<typeof addTeamResearchFunding>>;
        contribution: Awaited<ReturnType<typeof insertEquipmentResearchContribution>>;
        project: Awaited<ReturnType<typeof createEquipmentResearchProject>> | null;
      }
    | undefined;
  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
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
          requestId,
          mongoSession,
        });
        const updatedPool = await addTeamResearchFunding({
          poolId: String(pool._id),
          currentFundedAmount: pool.fundedAmount,
          amount: chargeAmount,
          session: mongoSession,
        });
        if (!updatedPool) throw new ResearchMutationError("RESEARCH_FUNDING_CONFLICT", 409, "동시에 다른 기여가 처리되었습니다.");

        const contribution = await insertEquipmentResearchContribution({
          scope: "team",
          action: "fund",
          projectKey: node.key,
          contributorCharacterId: budgetResult.budget.id,
          contributorCodename: budgetResult.budget.codename,
          amount: chargeAmount,
          requestId,
          session: mongoSession,
        });

        let project = null;
        if (updatedPool.fundedAmount >= updatedPool.targetCost) {
          const startedAt = new Date();
          project = await createEquipmentResearchProject(
            {
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
              identityKey: buildEquipmentResearchIdentityKey({ key: node.key, scope: "team", targetCharacterIds }),
              requestId: childIdempotencyKey(requestId, "project"),
            },
            { session: mongoSession },
          );
          const started = await markTeamFundingPoolStarted({
            poolId: String(updatedPool._id),
            projectId: String(project._id),
            session: mongoSession,
          });
          if (!started) throw new ResearchMutationError("RESEARCH_FUNDING_CONFLICT", 409, "연구 시작 상태를 확정하지 못했습니다.");
          await insertEquipmentResearchContribution({
            scope: "team",
            action: "start",
            projectKey: node.key,
            projectId: String(project._id),
            contributorCharacterId: budgetResult.budget.id,
            contributorCodename: budgetResult.budget.codename,
            amount: 0,
            requestId: childIdempotencyKey(requestId, "start"),
            session: mongoSession,
          });
        }
        await requestEquipmentResearchDiscordCardSync(node.key, {
          session: mongoSession,
        });
        transactionResult = { balance: chargeResult.balance, updatedPool, contribution, project };
      });
    } finally {
      await mongoSession.endSession();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "팀 연구 기여 실패";
    return NextResponse.json(
      { error: message, code: err instanceof ResearchMutationError ? err.code : "RESEARCH_START_FAILED" },
      { status: err instanceof ResearchMutationError ? err.status : message.includes("duplicate key") ? 409 : 500 },
    );
  }

  if (!transactionResult?.updatedPool) {
    return NextResponse.json({ error: "연구 트랜잭션이 완료되지 않았습니다.", code: "RESEARCH_START_FAILED" }, { status: 500 });
  }
  const { balance, updatedPool, contribution, project } = transactionResult;
  scheduleEquipmentResearchDiscordCardSync(node.key);
  scheduleGmAdminAudit({
    action: project ? "팀 장비 연구 기여 및 시작" : "팀 장비 연구 기여",
    actor: {
      id: authResult.session.id,
      displayName: authResult.session.displayName,
      role: authResult.session.role,
    },
    summary: `${chargeAmount.toLocaleString()} CR · ${updatedPool.fundedAmount.toLocaleString()} / ${updatedPool.targetCost.toLocaleString()} CR`,
    target: node.key,
    timestamp: new Date(),
  });

  return NextResponse.json(
    {
      pool: serializeEquipmentResearchTeamFundingPool(updatedPool),
      contribution: serializeEquipmentResearchContribution(contribution),
      project: project ? serializeEquipmentResearchProject(project) : null,
      balance,
      chargedAmount: chargeAmount,
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
