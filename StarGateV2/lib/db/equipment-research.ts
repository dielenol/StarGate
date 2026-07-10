import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Filter,
  type WithId,
} from "mongodb";

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
import {
  buildResearchContributionRankings,
  type EquipmentResearchContributionAction,
} from "@/lib/equipment-shop/research-contributions";

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
  rushRequestIds?: string[];
  status: EquipmentResearchStatus;
  startedAt: Date;
  completedAt: Date;
  targetCharacterIds: string[];
  createdBy: string;
  identityKey: string;
  requestId: string;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentResearchTeamFundingPool {
  _id?: ObjectId;
  key: string;
  targetCost: number;
  fundedAmount: number;
  status: "funding" | "started" | "cancelled";
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentResearchContribution {
  _id?: ObjectId;
  scope: "team";
  action: EquipmentResearchContributionAction;
  projectKey: string;
  projectId?: string;
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  rushHours?: number;
  requestId: string;
  createdAt: Date;
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

export interface SerializedEquipmentResearchTeamFundingPool
  extends Omit<
    EquipmentResearchTeamFundingPool,
    "_id" | "createdAt" | "updatedAt"
  > {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedEquipmentResearchContribution
  extends Omit<EquipmentResearchContribution, "_id" | "createdAt"> {
  id: string;
  createdAt: string;
}

export interface SerializedEquipmentResearchContributionRanking {
  contributorCharacterId: string;
  contributorCodename: string;
  totalAmount: number;
  contributionCount: number;
  lastContributedAt: string;
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
  identityKey: string;
  requestId: string;
}

export function buildEquipmentResearchIdentityKey(args: {
  key: string;
  scope: EquipmentResearchScope;
  targetCharacterIds: string[];
}): string {
  const targets =
    args.scope === "team"
      ? "team"
      : [...args.targetCharacterIds].sort().join(",");
  return `${args.key}:${args.scope}:${targets}`;
}

const COLLECTION_NAME = "research_projects";
const TEAM_FUNDING_COLLECTION_NAME = "research_team_funding_pools";
const CONTRIBUTION_COLLECTION_NAME = "research_contributions";

async function equipmentResearchProjectsCol(): Promise<
  Collection<EquipmentResearchProject>
> {
  const db = await getDb();
  return db.collection<EquipmentResearchProject>(COLLECTION_NAME);
}

async function equipmentResearchTeamFundingPoolsCol(): Promise<
  Collection<EquipmentResearchTeamFundingPool>
> {
  const db = await getDb();
  return db.collection<EquipmentResearchTeamFundingPool>(
    TEAM_FUNDING_COLLECTION_NAME,
  );
}

async function equipmentResearchContributionsCol(): Promise<
  Collection<EquipmentResearchContribution>
> {
  const db = await getDb();
  return db.collection<EquipmentResearchContribution>(
    CONTRIBUTION_COLLECTION_NAME,
  );
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
    identityKey:
      project.identityKey ??
      buildEquipmentResearchIdentityKey({
        key: project.key,
        scope: project.scope,
        targetCharacterIds: project.targetCharacterIds,
      }),
    requestId: project.requestId ?? "",
    ...(project.appliedAt ? { appliedAt: project.appliedAt.toISOString() } : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function serializeEquipmentResearchTeamFundingPool(
  pool:
    | WithId<EquipmentResearchTeamFundingPool>
    | EquipmentResearchTeamFundingPool,
): SerializedEquipmentResearchTeamFundingPool {
  return {
    id: pool._id ? String(pool._id) : "",
    key: pool.key,
    targetCost: pool.targetCost,
    fundedAmount: pool.fundedAmount,
    status: pool.status,
    ...(pool.projectId ? { projectId: pool.projectId } : {}),
    createdAt: pool.createdAt.toISOString(),
    updatedAt: pool.updatedAt.toISOString(),
  };
}

export function serializeEquipmentResearchContribution(
  contribution:
    | WithId<EquipmentResearchContribution>
    | EquipmentResearchContribution,
): SerializedEquipmentResearchContribution {
  return {
    id: contribution._id ? String(contribution._id) : "",
    scope: contribution.scope,
    action: contribution.action,
    projectKey: contribution.projectKey,
    ...(contribution.projectId ? { projectId: contribution.projectId } : {}),
    contributorCharacterId: contribution.contributorCharacterId,
    contributorCodename: contribution.contributorCodename,
    amount: contribution.amount,
    ...(contribution.rushHours ? { rushHours: contribution.rushHours } : {}),
    requestId: contribution.requestId ?? "",
    createdAt: contribution.createdAt.toISOString(),
  };
}

export function serializeEquipmentResearchContributionRanking(input: {
  contributorCharacterId: string;
  contributorCodename: string;
  totalAmount: number;
  contributionCount: number;
  lastContributedAt: Date;
}): SerializedEquipmentResearchContributionRanking {
  return {
    contributorCharacterId: input.contributorCharacterId,
    contributorCodename: input.contributorCodename,
    totalAmount: input.totalAmount,
    contributionCount: input.contributionCount,
    lastContributedAt: input.lastContributedAt.toISOString(),
  };
}

export async function createEquipmentResearchProject(
  input: CreateEquipmentResearchProjectInput,
  options: { session?: ClientSession } = {},
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
  const result = await col.insertOne(project, { session: options.session });
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

export async function listReadyEquipmentResearchProjects(
  now = new Date(),
  limit = 20,
): Promise<Array<WithId<EquipmentResearchProject>>> {
  const col = await equipmentResearchProjectsCol();
  return col
    .find({
      status: "in_progress",
      completedAt: { $lte: now },
    })
    .sort({ completedAt: 1 })
    .limit(limit)
    .toArray();
}

export async function findEquipmentResearchProjectByKey(args: {
  key: string;
  scope: EquipmentResearchScope;
  statuses?: EquipmentResearchStatus[];
}): Promise<WithId<EquipmentResearchProject> | null> {
  const col = await equipmentResearchProjectsCol();
  return col.findOne({
    key: args.key,
    scope: args.scope,
    ...(args.statuses ? { status: { $in: args.statuses } } : {}),
  });
}

export async function findEquipmentResearchProjectById(
  id: string,
): Promise<WithId<EquipmentResearchProject> | null> {
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const col = await equipmentResearchProjectsCol();
  return col.findOne({ _id: objectId });
}

export async function getOrCreateTeamFundingPool(args: {
  key: string;
  targetCost: number;
}): Promise<WithId<EquipmentResearchTeamFundingPool>> {
  const now = new Date();
  const col = await equipmentResearchTeamFundingPoolsCol();
  const pool = await col.findOneAndUpdate(
    { key: args.key, status: "funding" },
    {
      $setOnInsert: {
        key: args.key,
        targetCost: args.targetCost,
        fundedAmount: 0,
        status: "funding",
        createdAt: now,
      },
      $set: {
        targetCost: args.targetCost,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!pool) {
    throw new Error("TEAM_FUNDING_POOL_UPSERT_FAILED");
  }
  return pool;
}

export async function listTeamFundingPools(
  limit = 100,
): Promise<Array<WithId<EquipmentResearchTeamFundingPool>>> {
  const col = await equipmentResearchTeamFundingPoolsCol();
  return col
    .find({})
    .sort({ status: 1, updatedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function addTeamResearchFunding(args: {
  poolId: string;
  currentFundedAmount: number;
  amount: number;
  session?: ClientSession;
}): Promise<WithId<EquipmentResearchTeamFundingPool> | null> {
  const objectId = toObjectId(args.poolId);
  if (!objectId) return null;
  const col = await equipmentResearchTeamFundingPoolsCol();
  return col.findOneAndUpdate(
    {
      _id: objectId,
      status: "funding",
      fundedAmount: args.currentFundedAmount,
    },
    {
      $inc: { fundedAmount: args.amount },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after", session: args.session },
  );
}

export async function rollbackTeamResearchFunding(args: {
  poolId: string;
  amount: number;
}): Promise<void> {
  const objectId = toObjectId(args.poolId);
  if (!objectId || args.amount <= 0) return;
  const col = await equipmentResearchTeamFundingPoolsCol();
  await col.updateOne(
    { _id: objectId, status: "funding" },
    {
      $inc: { fundedAmount: -args.amount },
      $set: { updatedAt: new Date() },
    },
  );
}

export async function markTeamFundingPoolStarted(args: {
  poolId: string;
  projectId: string;
  session?: ClientSession;
}): Promise<boolean> {
  const objectId = toObjectId(args.poolId);
  if (!objectId) return false;
  const col = await equipmentResearchTeamFundingPoolsCol();
  const result = await col.updateOne(
    { _id: objectId, status: "funding" },
    {
      $set: {
        status: "started",
        projectId: args.projectId,
        updatedAt: new Date(),
      },
    },
    { session: args.session },
  );
  return result.modifiedCount === 1;
}

export async function insertEquipmentResearchContribution(input: {
  scope: "team";
  action: EquipmentResearchContributionAction;
  projectKey: string;
  projectId?: string;
  contributorCharacterId: string;
  contributorCodename: string;
  amount: number;
  rushHours?: number;
  requestId: string;
  session?: ClientSession;
}): Promise<WithId<EquipmentResearchContribution>> {
  const col = await equipmentResearchContributionsCol();
  const contribution: EquipmentResearchContribution = {
    scope: input.scope,
    action: input.action,
    projectKey: input.projectKey,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    contributorCharacterId: input.contributorCharacterId,
    contributorCodename: input.contributorCodename,
    amount: input.amount,
    ...(input.rushHours ? { rushHours: input.rushHours } : {}),
    requestId: input.requestId,
    createdAt: new Date(),
  };
  const result = await col.insertOne(contribution, { session: input.session });
  return { ...contribution, _id: result.insertedId };
}

export async function listEquipmentResearchContributions(
  limit = 30,
): Promise<Array<WithId<EquipmentResearchContribution>>> {
  const col = await equipmentResearchContributionsCol();
  return col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function listEquipmentResearchContributionRankings(
  limit = 10,
): Promise<SerializedEquipmentResearchContributionRanking[]> {
  const col = await equipmentResearchContributionsCol();
  const contributions = await col
    .find({ amount: { $gt: 0 } })
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();
  return buildResearchContributionRankings(contributions)
    .slice(0, limit)
    .map(serializeEquipmentResearchContributionRanking);
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
  session?: ClientSession;
  requestId: string;
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
      rushRequestIds: { $ne: args.requestId },
    },
    {
      $inc: { rushUsed: 1 },
      $addToSet: { rushRequestIds: args.requestId },
      $set,
    },
    { session: args.session },
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
  options: { session?: ClientSession } = {},
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
    { session: options.session },
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
