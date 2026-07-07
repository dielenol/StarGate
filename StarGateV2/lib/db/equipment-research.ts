import { ObjectId, type Collection, type Filter, type WithId } from "mongodb";

import "./init";

import { getDb } from "@stargate/shared-db";

import {
  DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES,
  EQUIPMENT_RESEARCH_CAPS,
  type EquipmentResearchCapabilities,
  type EquipmentResearchEffect,
  type EquipmentResearchScope,
  type EquipmentResearchStat,
  type EquipmentResearchStatus,
  type EquipmentResearchTier,
  applyEquipmentResearchCapabilityEffect,
  getEquipmentResearchEffect,
  getEquipmentResearchNode,
  getEquipmentResearchPrerequisiteTier,
  type EquipmentResearchNode,
} from "@/lib/equipment-shop/research";

export interface EquipmentResearchProject {
  _id?: ObjectId;
  key: string;
  tier: EquipmentResearchTier;
  scope: EquipmentResearchScope;
  effect: EquipmentResearchEffect;
  cost: number;
  durationHours: number;
  rushUsed: number;
  rushDiscountUsed?: boolean;
  status: EquipmentResearchStatus;
  startedAt: Date;
  completedAt: Date;
  targetCharacterIds: string[];
  createdBy: string;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedEquipmentResearchProject
  extends Omit<
    EquipmentResearchProject,
    "_id" | "startedAt" | "completedAt" | "appliedAt" | "createdAt" | "updatedAt"
  > {
  id: string;
  startedAt: string;
  completedAt: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentResearchProjectInput {
  key: string;
  tier: EquipmentResearchTier;
  scope: EquipmentResearchScope;
  effect: EquipmentResearchEffect;
  cost: number;
  durationHours: number;
  startedAt: Date;
  completedAt: Date;
  targetCharacterIds: string[];
  createdBy: string;
}

const COLLECTION_NAME = "research_projects";

async function equipmentResearchProjectsCol(): Promise<
  Collection<EquipmentResearchProject>
> {
  const db = await getDb();
  return db.collection<EquipmentResearchProject>(COLLECTION_NAME);
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function serializeEquipmentResearchProject(
  project: WithId<EquipmentResearchProject> | EquipmentResearchProject,
): SerializedEquipmentResearchProject {
  return {
    id: project._id ? String(project._id) : "",
    key: project.key,
    tier: project.tier,
    scope: project.scope,
    effect: project.effect,
    cost: project.cost,
    durationHours: project.durationHours,
    rushUsed: project.rushUsed,
    ...(project.rushDiscountUsed ? { rushDiscountUsed: true } : {}),
    status: project.status,
    startedAt: project.startedAt.toISOString(),
    completedAt: project.completedAt.toISOString(),
    targetCharacterIds: project.targetCharacterIds,
    createdBy: project.createdBy,
    ...(project.appliedAt ? { appliedAt: project.appliedAt.toISOString() } : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export async function createEquipmentResearchProject(
  input: CreateEquipmentResearchProjectInput,
): Promise<WithId<EquipmentResearchProject>> {
  const now = new Date();
  const project: EquipmentResearchProject = {
    ...input,
    rushUsed: 0,
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
  };
  const col = await equipmentResearchProjectsCol();
  const result = await col.insertOne(project);
  return { ...project, _id: result.insertedId };
}

export async function listEquipmentResearchProjects(
  limit = 100,
): Promise<Array<WithId<EquipmentResearchProject>>> {
  const col = await equipmentResearchProjectsCol();
  return col
    .find({})
    .sort({ status: 1, tier: 1, startedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function findEquipmentResearchProjectById(
  id: string,
): Promise<WithId<EquipmentResearchProject> | null> {
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const col = await equipmentResearchProjectsCol();
  return col.findOne({ _id: objectId });
}

export async function hasAppliedEquipmentResearchTierPrerequisite(args: {
  scope: EquipmentResearchScope;
  tier: EquipmentResearchTier;
  targetCharacterIds: string[];
}): Promise<boolean> {
  const requiredTier = getEquipmentResearchPrerequisiteTier(args.tier);
  if (!requiredTier) return true;

  const col = await equipmentResearchProjectsCol();
  const filter: Filter<EquipmentResearchProject> = {
    scope: args.scope,
    tier: requiredTier,
    status: "applied",
  };

  if (args.scope === "personal") {
    if (args.targetCharacterIds.length === 0) return false;
    filter.targetCharacterIds = { $in: args.targetCharacterIds };
  }

  const project = await col.findOne(filter, { projection: { _id: 1 } });
  return Boolean(project);
}

export async function findMissingAppliedEquipmentResearchPrerequisites(args: {
  node: EquipmentResearchNode;
  scope: EquipmentResearchScope;
  targetCharacterIds: string[];
}): Promise<{ requiredTier: EquipmentResearchTier | null; keys: string[] }> {
  const requiredTier = getEquipmentResearchPrerequisiteTier(args.node.tier);
  const hasTier = await hasAppliedEquipmentResearchTierPrerequisite({
    scope: args.scope,
    tier: args.node.tier,
    targetCharacterIds: args.targetCharacterIds,
  });
  const missing = {
    requiredTier: hasTier ? null : requiredTier,
    keys: [] as string[],
  };

  const prerequisiteKeys = args.node.prerequisiteKeys ?? [];
  if (prerequisiteKeys.length === 0) return missing;

  const col = await equipmentResearchProjectsCol();
  const filter: Filter<EquipmentResearchProject> = {
    scope: args.scope,
    key: { $in: prerequisiteKeys },
    status: "applied",
  };

  if (args.scope === "personal") {
    if (args.targetCharacterIds.length === 0) {
      return { ...missing, keys: prerequisiteKeys };
    }
    filter.targetCharacterIds = { $in: args.targetCharacterIds };
  }

  const projects = await col
    .find(filter, { projection: { key: 1 } })
    .toArray();
  const appliedKeys = new Set(projects.map((project) => project.key));
  return {
    ...missing,
    keys: prerequisiteKeys.filter((key) => !appliedKeys.has(key)),
  };
}

export async function updateEquipmentResearchProjectRush(args: {
  id: string;
  currentRushUsed: number;
  nextCompletedAt: Date;
  discountApplied: boolean;
}): Promise<boolean> {
  const objectId = toObjectId(args.id);
  if (!objectId) return false;
  const col = await equipmentResearchProjectsCol();
  const $set: Partial<EquipmentResearchProject> = {
    completedAt: args.nextCompletedAt,
    updatedAt: new Date(),
  };
  if (args.discountApplied) $set.rushDiscountUsed = true;
  const result = await col.updateOne(
    {
      _id: objectId,
      status: "in_progress",
      rushUsed: args.currentRushUsed,
    },
    {
      $inc: { rushUsed: 1 },
      $set,
    },
  );
  return result.modifiedCount === 1;
}

export async function reserveEquipmentResearchProjectForApply(
  id: string,
  now = new Date(),
): Promise<WithId<EquipmentResearchProject> | null> {
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const col = await equipmentResearchProjectsCol();
  return col.findOneAndUpdate(
    {
      _id: objectId,
      status: "in_progress",
      completedAt: { $lte: now },
    },
    {
      $set: {
        status: "applying",
        updatedAt: now,
      },
    },
    { returnDocument: "before" },
  );
}

export async function markEquipmentResearchProjectApplied(
  id: string,
): Promise<boolean> {
  const objectId = toObjectId(id);
  if (!objectId) return false;
  const now = new Date();
  const col = await equipmentResearchProjectsCol();
  const result = await col.updateOne(
    { _id: objectId, status: "applying" },
    {
      $set: {
        status: "applied",
        appliedAt: now,
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function releaseEquipmentResearchProjectApplyReservation(
  id: string,
): Promise<void> {
  const objectId = toObjectId(id);
  if (!objectId) return;
  const col = await equipmentResearchProjectsCol();
  await col.updateOne(
    { _id: objectId, status: "applying" },
    {
      $set: {
        status: "in_progress",
        updatedAt: new Date(),
      },
    },
  );
}

export async function listAppliedEquipmentResearchProjectsForTarget(
  characterId: string,
): Promise<Array<WithId<EquipmentResearchProject>>> {
  const col = await equipmentResearchProjectsCol();
  return col
    .find({
      status: "applied",
      targetCharacterIds: characterId,
    })
    .toArray();
}

export async function sumAppliedEquipmentResearchStat(
  characterId: string,
  stat: EquipmentResearchStat,
): Promise<number> {
  const projects = await listAppliedEquipmentResearchProjectsForTarget(
    characterId,
  );
  return projects.reduce((sum, project) => {
    if (project.effect.kind !== "stat" || project.effect.stat !== stat) {
      return sum;
    }
    return sum + project.effect.amount;
  }, 0);
}

export async function sumAppliedEquipmentResearchPoints(
  characterId: string,
): Promise<number> {
  const projects = await listAppliedEquipmentResearchProjectsForTarget(
    characterId,
  );
  return projects.reduce((sum, project) => {
    if (project.effect.kind !== "point") return sum;
    return sum + project.effect.amount;
  }, 0);
}

export async function canApplyEquipmentResearchEffect(args: {
  characterId: string;
  effect: EquipmentResearchEffect;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (args.effect.kind === "stat") {
    const applied = await sumAppliedEquipmentResearchStat(
      args.characterId,
      args.effect.stat,
    );
    const cap = EQUIPMENT_RESEARCH_CAPS[args.effect.stat];
    if (applied + args.effect.amount > cap) {
      return {
        ok: false,
        reason: `${args.effect.stat.toUpperCase()} 연구 누적 상한 ${cap} 초과`,
      };
    }
  }
  if (args.effect.kind === "point") {
    const applied = await sumAppliedEquipmentResearchPoints(args.characterId);
    if (applied + args.effect.amount > EQUIPMENT_RESEARCH_CAPS.points) {
      return {
        ok: false,
        reason: `BONUS POINT 연구 누적 상한 ${EQUIPMENT_RESEARCH_CAPS.points} 초과`,
      };
    }
  }
  return { ok: true };
}

export async function getEquipmentResearchCapabilities(
  characterId: string | null,
): Promise<EquipmentResearchCapabilities> {
  if (!characterId) return { ...DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES };
  const projects = await listAppliedEquipmentResearchProjectsForTarget(
    characterId,
  );
  return projects.reduce<EquipmentResearchCapabilities>(
    (capabilities, project) => {
      const node = getEquipmentResearchNode(project.key);
      const effect = node
        ? getEquipmentResearchEffect(node, project.scope) ?? project.effect
        : project.effect;
      return applyEquipmentResearchCapabilityEffect(capabilities, effect);
    },
    { ...DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES },
  );
}

export async function countActiveEquipmentResearchProjects(
  createdBy: string,
): Promise<number> {
  const filter: Filter<EquipmentResearchProject> = {
    createdBy,
    status: { $in: ["in_progress", "applying"] },
  };
  const col = await equipmentResearchProjectsCol();
  return col.countDocuments(filter);
}
