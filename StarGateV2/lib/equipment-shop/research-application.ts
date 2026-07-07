import type { WithId } from "mongodb";

import type { RoleLevel } from "@stargate/shared-db";

import { findCharacterById } from "@/lib/db/characters";
import {
  adjustCharacterPoints,
  adjustCharacterStat,
} from "@/lib/db/character-points";
import {
  canApplyEquipmentResearchEffect,
  insertEquipmentResearchContribution,
  listReadyEquipmentResearchProjects,
  markEquipmentResearchProjectApplied,
  releaseEquipmentResearchProjectApplyReservation,
  reserveEquipmentResearchProjectForApply,
  type EquipmentResearchProject,
} from "@/lib/db/equipment-research";
import { notifyEquipmentResearchEvent } from "@/lib/discord";

export interface EquipmentResearchActor {
  id: string;
  role: RoleLevel;
  displayName: string;
}

export interface AppliedResearchTargetResult {
  id: string;
  codename: string;
  before: number;
  after: number;
}

export interface ApplyEquipmentResearchProjectResult {
  projectId: string;
  key: string;
  scope: EquipmentResearchProject["scope"];
  effect: EquipmentResearchProject["effect"];
  affected: number;
  skipped: Array<{ id: string; reason: string }>;
  targets: AppliedResearchTargetResult[];
}

async function applyReservedProject(
  project: WithId<EquipmentResearchProject>,
  actor: EquipmentResearchActor,
): Promise<ApplyEquipmentResearchProjectResult> {
  const projectId = String(project._id);
  const targets: AppliedResearchTargetResult[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

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
        actorId: actor.id,
        actorRole: actor.role,
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
        actorId: actor.id,
        actorRole: actor.role,
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
    throw new Error("NO_AGENT_TARGETS");
  }

  const marked = await markEquipmentResearchProjectApplied(projectId);
  if (!marked) {
    throw new Error("RESEARCH_APPLY_MARK_FAILED");
  }

  if (project.scope === "team") {
    await insertEquipmentResearchContribution({
      scope: "team",
      action: "apply",
      projectKey: project.key,
      projectId,
      contributorCharacterId: "system",
      contributorCodename: "연구소 자동 적용",
      amount: 0,
    });
    void notifyEquipmentResearchEvent({
      kind: "apply",
      projectKey: project.key,
      actorName: actor.displayName,
      affected: targets.length,
    });
  }

  return {
    projectId,
    key: project.key,
    scope: project.scope,
    effect: project.effect,
    affected: targets.length,
    skipped,
    targets,
  };
}

export async function applyEquipmentResearchProjectNow(args: {
  projectId: string;
  actor: EquipmentResearchActor;
}): Promise<ApplyEquipmentResearchProjectResult | null> {
  const project = await reserveEquipmentResearchProjectForApply(args.projectId);
  if (!project) return null;

  try {
    return await applyReservedProject(project, args.actor);
  } catch (err) {
    await releaseEquipmentResearchProjectApplyReservation(args.projectId);
    throw err;
  }
}

export async function applyReadyEquipmentResearchProjects(args: {
  actor: EquipmentResearchActor;
  limit?: number;
}): Promise<ApplyEquipmentResearchProjectResult[]> {
  const readyProjects = await listReadyEquipmentResearchProjects(
    new Date(),
    args.limit ?? 20,
  );
  const results: ApplyEquipmentResearchProjectResult[] = [];

  for (const project of readyProjects) {
    try {
      const result = await applyEquipmentResearchProjectNow({
        projectId: String(project._id),
        actor: args.actor,
      });
      if (result) results.push(result);
    } catch (err) {
      console.warn(
        `[equipment-shop/research] auto apply failed project=${String(project._id)} key=${project.key}:`,
        err,
      );
    }
  }

  return results;
}
