import { ObjectId, type ClientSession, type WithId } from "mongodb";

import {
  charactersCol,
  getClient,
  usersCol,
  type RoleLevel,
} from "@stargate/shared-db";

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
  requestEquipmentResearchDiscordCardSync,
  reserveEquipmentResearchProjectForApply,
  type EquipmentResearchProject,
} from "@/lib/db/equipment-research";
import { enqueueEquipmentResearchWorkflowStatus } from "@/lib/equipment-shop/research-workflow";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

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
  session: ClientSession,
): Promise<ApplyEquipmentResearchProjectResult> {
  const projectId = String(project._id);
  const targets: AppliedResearchTargetResult[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  if (
    project.scope === "personal" &&
    project.effect.kind !== "stat" &&
    project.effect.kind !== "point"
  ) {
    if (project.targetCharacterIds.length !== 1) {
      throw new Error("INVALID_PERSONAL_RESEARCH_TARGET");
    }
    const [targetId] = project.targetCharacterIds;
    if (!targetId || !ObjectId.isValid(targetId)) {
      throw new Error("INVALID_PERSONAL_RESEARCH_TARGET");
    }
    const character = await (await charactersCol()).findOne(
      { _id: new ObjectId(targetId) },
      { session, projection: { type: 1, ownerId: 1 } },
    );
    if (!character) {
      throw new Error("PERSONAL_RESEARCH_TARGET_NOT_FOUND");
    }
    if (character.type === "NPC") {
      const ownerId =
        typeof character.ownerId === "string" ? character.ownerId : "";
      const activeGmOwner =
        ownerId === project.createdBy &&
        ObjectId.isValid(ownerId) &&
        (await (await usersCol()).findOne(
          {
            _id: new ObjectId(ownerId),
            role: "GM",
            status: "ACTIVE",
          },
          { session, projection: { _id: 1 } },
        ));
      if (!activeGmOwner) {
        throw new Error("GM_NPC_RESEARCH_TARGET_ACCESS_CHANGED");
      }
    }
  }

  if (project.effect.kind === "stat") {
    for (const targetId of project.targetCharacterIds) {
      const character = await findCharacterById(targetId, { session });
      if (!character || character.type !== "AGENT" || !character._id) {
        skipped.push({ id: targetId, reason: "AGENT 캐릭터 없음" });
        continue;
      }
      const capCheck = await canApplyEquipmentResearchEffect({
        characterId: targetId,
        effect: project.effect,
        session,
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
        session,
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
      const character = await findCharacterById(targetId, { session });
      if (!character || character.type !== "AGENT" || !character._id) {
        skipped.push({ id: targetId, reason: "AGENT 캐릭터 없음" });
        continue;
      }
      const capCheck = await canApplyEquipmentResearchEffect({
        characterId: targetId,
        effect: project.effect,
        session,
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
        session,
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

  if (!project.applyLeaseToken) {
    throw new Error("RESEARCH_APPLY_LEASE_TOKEN_MISSING");
  }
  const marked = await markEquipmentResearchProjectApplied(projectId, {
    applyLeaseToken: project.applyLeaseToken,
    session,
  });
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
      requestId: `research-apply:${projectId}`,
      session,
    });
    await requestEquipmentResearchDiscordCardSync(project.key, { session });
  }

  await enqueueEquipmentResearchWorkflowStatus({
    project,
    stage: "APPLIED",
    revision: project.rushUsed + 1,
    actor: {
      kind: actor.role === "GM" ? "GM" : "PLAYER",
      displayName: actor.displayName,
    },
    summary: `연구 효과 적용이 완료되었습니다. 적용 ${targets.length}건 · 생략 ${skipped.length}건`,
    occurredAt: new Date(),
    dedupeToken: "applied",
    session,
  });
  await scheduleGmAdminAudit({
    action: "장비 연구 효과 적용",
    actor: {
      id: actor.id,
      displayName: actor.displayName,
      role: actor.role,
    },
    summary: `적용 ${targets.length}명 · 스킵 ${skipped.length}명`,
    target: project.key,
    timestamp: new Date(),
  }, { session });

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
  if (!project.applyLeaseToken) {
    throw new Error("RESEARCH_APPLY_LEASE_TOKEN_MISSING");
  }

  const client = await getClient();
  const session = client.startSession();
  try {
    let result: ApplyEquipmentResearchProjectResult | undefined;
    await session.withTransaction(async () => {
      result = await applyReservedProject(project, args.actor, session);
    });
    if (!result) throw new Error("RESEARCH_APPLY_TRANSACTION_EMPTY");
    return result;
  } catch (err) {
    await releaseEquipmentResearchProjectApplyReservation(
      args.projectId,
      project.applyLeaseToken,
    );
    throw err;
  } finally {
    await session.endSession();
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
