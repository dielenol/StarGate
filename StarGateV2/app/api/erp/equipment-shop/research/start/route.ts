import { NextResponse } from "next/server";

import type { AgentCharacter, Character } from "@stargate/shared-db/types";

import {
  findCharacterById,
  listAgentCharacters,
} from "@/lib/db/characters";
import {
  canApplyEquipmentResearchEffect,
  createEquipmentResearchProject,
  serializeEquipmentResearchProject,
} from "@/lib/db/equipment-research";
import {
  addHours,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  isEquipmentResearchScope,
} from "@/lib/equipment-shop/research";

import {
  chargeResearchCredits,
  refundResearchCredits,
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
    typeof args.targetCharacterId === "string" && args.targetCharacterId.trim()
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

  const budgetResult = await resolveResearchBudgetCharacter(
    authResult.session.id,
  );
  if ("response" in budgetResult) return budgetResult.response;

  const targetResult = await resolveTargets({
    scope,
    targetCharacterId: body?.targetCharacterId,
    fallbackCharacterId: budgetResult.budget.id,
  });
  if ("response" in targetResult) return targetResult.response;

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

  const chargeResult = await chargeResearchCredits({
    budget: budgetResult.budget,
    amount: node.cost,
    description: `병기 연구 시작 — ${node.key} ${node.name}`,
    metadata: {
      source: "equipment_shop_research_start",
      projectKey: node.key,
      tier: node.tier,
      scope,
      targetCount: targetResult.targets.length,
    },
    session: authResult.session,
  });
  if ("response" in chargeResult) return chargeResult.response;

  let project;
  try {
    const startedAt = new Date();
    project = await createEquipmentResearchProject({
      key: node.key,
      tier: node.tier,
      scope,
      effect,
      cost: node.cost,
      durationHours: node.durationHours,
      startedAt,
      completedAt: addHours(startedAt, node.durationHours),
      targetCharacterIds: targetResult.targets.map((target) =>
        String(target._id),
      ),
      createdBy: authResult.session.id,
    });
  } catch (err) {
    await refundResearchCredits({
      budget: budgetResult.budget,
      amount: node.cost,
      description: `병기 연구 자동 환불 — ${node.key} 등록 실패`,
      metadata: {
        source: "equipment_shop_research_start_refund",
        projectKey: node.key,
        reason: "project_create_failed",
      },
      session: authResult.session,
    });
    const message =
      err instanceof Error ? err.message : "연구 프로젝트 등록 실패";
    return NextResponse.json(
      {
        error: `연구 시작 실패 (자동 환불 시도 완료): ${message}`,
        code: "RESEARCH_START_FAILED",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      project: serializeEquipmentResearchProject(project),
      balance: chargeResult.balance,
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
