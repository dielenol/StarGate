import { NextResponse } from "next/server";

import { findCharacterById } from "@/lib/db/characters";
import { adjustCharacterPoints, adjustCharacterStat } from "@/lib/db/character-points";
import {
  canApplyEquipmentResearchEffect,
  markEquipmentResearchProjectApplied,
  releaseEquipmentResearchProjectApplyReservation,
  reserveEquipmentResearchProjectForApply,
} from "@/lib/db/equipment-research";

import { requireResearchGm } from "../_lib";

interface ApplyResearchBody {
  projectId?: unknown;
}

interface AppliedTargetResult {
  id: string;
  codename: string;
  before: number;
  after: number;
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

  const project = await reserveEquipmentResearchProjectForApply(projectId);
  if (!project) {
    return NextResponse.json(
      {
        error: "완료 대기 상태의 연구 프로젝트를 찾을 수 없습니다.",
        code: "RESEARCH_NOT_READY",
      },
      { status: 400 },
    );
  }

  const targets: AppliedTargetResult[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  try {
    if (project.effect.kind === "stat") {
      for (const targetId of project.targetCharacterIds) {
        const character = await findCharacterById(targetId);
        if (!character || character.type !== "AGENT" || !character._id) {
          skipped.push({ id: targetId, reason: "AGENT 캐릭터 없음" });
          continue;
        }
        const capCheck = await canApplyEquipmentResearchEffect({
          characterId: targetId,
          effect: project.effect,
        });
        if (!capCheck.ok) {
          skipped.push({ id: targetId, reason: capCheck.reason });
          continue;
        }

        const result = await adjustCharacterStat({
          characterId: targetId,
          field: project.effect.stat,
          amount: project.effect.amount,
          actorId: authResult.session.id,
          actorRole: authResult.session.role,
          reason: `병기 연구 완료 — ${project.key}`,
          metadata: {
            source: "equipment_shop_research",
            projectId,
            projectKey: project.key,
            tier: project.tier,
            scope: project.scope,
            stat: project.effect.stat,
            amount: project.effect.amount,
          },
        });
        targets.push({
          id: targetId,
          codename: result.character.codename,
          before: result.before,
          after: result.after,
        });
      }
    } else if (project.effect.kind === "point") {
      for (const targetId of project.targetCharacterIds) {
        const character = await findCharacterById(targetId);
        if (!character || character.type !== "AGENT" || !character._id) {
          skipped.push({ id: targetId, reason: "AGENT 캐릭터 없음" });
          continue;
        }
        const capCheck = await canApplyEquipmentResearchEffect({
          characterId: targetId,
          effect: project.effect,
        });
        if (!capCheck.ok) {
          skipped.push({ id: targetId, reason: capCheck.reason });
          continue;
        }

        const result = await adjustCharacterPoints({
          characterId: targetId,
          amount: project.effect.amount,
          actorId: authResult.session.id,
          actorRole: authResult.session.role,
          reason: `병기 연구 완료 — ${project.key}`,
          allowNegative: false,
          metadata: {
            source: "equipment_shop_research",
            projectId,
            projectKey: project.key,
            tier: project.tier,
            scope: project.scope,
            amount: project.effect.amount,
          },
        });
        targets.push({
          id: targetId,
          codename: result.character.codename,
          before: result.before,
          after: result.after,
        });
      }
    }

    if (
      (project.effect.kind === "stat" || project.effect.kind === "point") &&
      targets.length === 0
    ) {
      await releaseEquipmentResearchProjectApplyReservation(projectId);
      return NextResponse.json(
        {
          error: "연구 효과를 적용할 대상이 없습니다.",
          code: "NO_AGENT_TARGETS",
          skipped,
        },
        { status: 400 },
      );
    }

    const marked = await markEquipmentResearchProjectApplied(projectId);
    if (!marked) {
      return NextResponse.json(
        {
          error: "연구 적용 완료 상태 저장에 실패했습니다.",
          code: "RESEARCH_APPLY_MARK_FAILED",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        projectId,
        key: project.key,
        effect: project.effect,
        affected: targets.length,
        skipped,
        targets,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    await releaseEquipmentResearchProjectApplyReservation(projectId);
    const message = err instanceof Error ? err.message : "연구 적용 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
