import { NextResponse } from "next/server";

import type { AgentCharacter, Character } from "@stargate/shared-db/types";
import { getClient } from "@stargate/shared-db";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import {
  findCharacterById,
  listAgentCharacters,
} from "@/lib/db/characters";
import {
  canApplyEquipmentResearchEffect,
  buildEquipmentResearchIdentityKey,
  createEquipmentResearchProject,
  findMissingAppliedEquipmentResearchPrerequisites,
  getEquipmentResearchCapabilities,
  serializeEquipmentResearchProject,
} from "@/lib/db/equipment-research";
import {
  addHours,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  isEquipmentResearchEffectOperational,
  isEquipmentResearchScope,
  quoteEquipmentResearchStart,
} from "@/lib/equipment-shop/research";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

import {
  chargeResearchCredits,
  ResearchMutationError,
  requireResearchGm,
  resolveResearchBudgetCharacter,
} from "../_lib";

interface StartResearchBody {
  key?: unknown;
  scope?: unknown;
  targetCharacterId?: unknown;
}

type AgentCharacterWithId = AgentCharacter & {
  _id: NonNullable<AgentCharacter["_id"]>;
};

function isAgentCharacterWithId(
  character: Character | null,
): character is AgentCharacterWithId {
  return character?.type === "AGENT" && Boolean(character._id);
}

async function resolveTargets(args: {
  scope: "personal" | "team";
  targetCharacterId: unknown;
  fallbackCharacterId: string;
  allowTargetOverride: boolean;
}): Promise<
  | { targets: AgentCharacterWithId[] }
  | { response: NextResponse }
> {
  if (args.scope === "team") {
    const targets = (await listAgentCharacters(null)).filter(
      isAgentCharacterWithId,
    );
    if (targets.length === 0) {
      return {
        response: NextResponse.json(
          {
            error: "연구를 적용할 AGENT 캐릭터가 없습니다.",
            code: "NO_AGENT_TARGETS",
          },
          { status: 400 },
        ),
      };
    }
    return { targets };
  }

  const targetId =
    args.allowTargetOverride &&
    typeof args.targetCharacterId === "string" &&
    args.targetCharacterId.trim()
      ? args.targetCharacterId.trim()
      : args.fallbackCharacterId;
  const target = await findCharacterById(targetId);
  if (!isAgentCharacterWithId(target)) {
    return {
      response: NextResponse.json(
        {
          error: "개인 연구 대상 AGENT 캐릭터를 찾을 수 없습니다.",
          code: "NO_AGENT_TARGETS",
        },
        { status: 400 },
      ),
    };
  }
  return { targets: [target] };
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
    | StartResearchBody
    | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const node = key ? getEquipmentResearchNode(key) : null;
  const scope = body?.scope;
  if (!node || !isEquipmentResearchScope(scope)) {
    return NextResponse.json(
      {
        error: "연구 키 또는 적용 범위가 올바르지 않습니다.",
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }

  if (scope === "team") {
    return NextResponse.json(
      {
        error: "팀 연구는 기여 누적을 통해서만 시작할 수 있습니다.",
        code: "TEAM_RESEARCH_REQUIRES_CONTRIBUTION",
      },
      { status: 400 },
    );
  }

  const effect = getEquipmentResearchEffect(node, scope);
  if (!effect) {
    return NextResponse.json(
      {
        error: "해당 연구는 선택한 적용 범위를 지원하지 않습니다.",
        code: "INVALID_RESEARCH",
      },
      { status: 400 },
    );
  }
  if (!isEquipmentResearchEffectOperational(effect)) {
    return NextResponse.json(
      {
        error: "후속 기능이 준비되지 않은 연구는 아직 시작할 수 없습니다.",
        code: "RESEARCH_NOT_READY",
      },
      { status: 400 },
    );
  }

  const budgetResult = await resolveResearchBudgetCharacter(
    authResult.session.id,
  );
  if ("response" in budgetResult) return budgetResult.response;

  const targetResult = await resolveTargets({
    scope,
    targetCharacterId: body?.targetCharacterId,
    fallbackCharacterId: budgetResult.budget.id,
    allowTargetOverride: authResult.session.role === "GM",
  });
  if ("response" in targetResult) return targetResult.response;
  const targetCharacterIds = targetResult.targets.map((target) =>
    String(target._id),
  );

  const missingPrerequisites =
    await findMissingAppliedEquipmentResearchPrerequisites({
      node,
      scope,
      targetCharacterIds,
    });
  if (
    missingPrerequisites.requiredTier !== null ||
    missingPrerequisites.keys.length > 0
  ) {
    const reasons = [
      missingPrerequisites.requiredTier
        ? `같은 범위의 T${missingPrerequisites.requiredTier} 연구 적용`
        : "",
      missingPrerequisites.keys.length > 0
        ? `${missingPrerequisites.keys.join(", ")} 적용`
        : "",
    ].filter(Boolean);
    return NextResponse.json(
      {
        error: `T${node.tier} ${node.key} 연구는 ${reasons.join(" 및 ")} 후 시작할 수 있습니다.`,
        code: "RESEARCH_PREREQUISITE_MISSING",
      },
      { status: 400 },
    );
  }

  const capabilities = await getEquipmentResearchCapabilities(
    budgetResult.budget.id,
  );
  const startQuote = quoteEquipmentResearchStart({ node, capabilities });

  for (const target of targetResult.targets) {
    const targetId = String(target._id);
    const capCheck = await canApplyEquipmentResearchEffect({
      characterId: targetId,
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

  let result:
    | { project: Awaited<ReturnType<typeof createEquipmentResearchProject>>; balance: number }
    | undefined;
  try {
    const client = await getClient();
    const mongoSession = client.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const chargeResult = await chargeResearchCredits({
          budget: budgetResult.budget,
          amount: startQuote.cost,
          description: `병기 연구 시작 — ${node.key} ${node.name}`,
          metadata: {
            source: "equipment_shop_research_start",
            projectKey: node.key,
            tier: node.tier,
            scope,
            targetCount: targetResult.targets.length,
            baseCost: node.cost,
            costDiscount: startQuote.costDiscount,
            baseDurationHours: node.durationHours,
            durationReductionHours: startQuote.durationReductionHours,
            chargedCost: startQuote.cost,
            durationHours: startQuote.durationHours,
          },
          session: authResult.session,
          requestId,
          mongoSession,
        });
        const startedAt = new Date();
        const project = await createEquipmentResearchProject(
          {
            key: node.key,
            tier: node.tier,
            scope,
            effect,
            cost: startQuote.cost,
            durationHours: startQuote.durationHours,
            startedAt,
            completedAt: addHours(startedAt, startQuote.durationHours),
            targetCharacterIds,
            createdBy: authResult.session.id,
            identityKey: buildEquipmentResearchIdentityKey({
              key: node.key,
              scope,
              targetCharacterIds,
            }),
            requestId,
          },
          { session: mongoSession },
        );
        result = { project, balance: chargeResult.balance };
      });
    } finally {
      await mongoSession.endSession();
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "연구 프로젝트 등록 실패";
    const status =
      err instanceof ResearchMutationError
        ? err.status
        : message.includes("duplicate key")
          ? 409
          : 500;
    const code =
      err instanceof ResearchMutationError
        ? err.code
        : message.includes("duplicate key")
          ? "DUPLICATE_REQUEST"
          : "RESEARCH_START_FAILED";
    return NextResponse.json(
      {
        error: `연구 시작 실패: ${message}`,
        code,
      },
      { status },
    );
  }

  if (!result) {
    return NextResponse.json(
      { error: "연구 트랜잭션이 완료되지 않았습니다.", code: "RESEARCH_START_FAILED" },
      { status: 500 },
    );
  }

  scheduleGmAdminAudit({
    action: "개인 장비 연구 시작",
    actor: {
      id: authResult.session.id,
      displayName: authResult.session.displayName,
      role: authResult.session.role,
    },
    summary: `${startQuote.cost.toLocaleString()} CR · ${startQuote.durationHours}시간`,
    target: `${node.key} · ${targetResult.targets.map((target) => target.codename).join(", ")}`,
    timestamp: new Date(),
  });

  return NextResponse.json(
    {
      project: serializeEquipmentResearchProject(result.project),
      balance: result.balance,
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
