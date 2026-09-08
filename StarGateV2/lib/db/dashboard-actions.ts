import "server-only";
import "./init";

import {
  bureaucratVotesCol,
  playerTradesCol,
  researchLabJobsCol,
  type PlayerTrade,
  type ResearchLabJob,
} from "@stargate/shared-db";
import type { Filter } from "mongodb";

import { isResearchLabMutationConfigured } from "@/lib/research/research-lab-readiness";

import {
  equipmentWorkshopRequestsCol,
  type EquipmentWorkshopRequestDoc,
} from "./equipment-workshop-requests";

const DOMAIN_PREVIEW_LIMIT = 8;
const BUILD_REQUEST_KINDS = ["upgrade", "custom"] as const;

export interface DashboardActionBatch<T> {
  items: T[];
  totalCount: number;
}

export type WorkshopDashboardActionState =
  | "OWNER_QUOTE"
  | "OWNER_COMPLETION_CHECK"
  | "OWNER_CONDITION_INVALID"
  | "GM_REVIEW"
  | "GM_QUOTE"
  | "GM_RELOAD_APPROVAL";

export interface WorkshopDashboardActionCandidate {
  id: string;
  state: WorkshopDashboardActionState;
  characterCodename: string;
  subject: string;
  updatedAt: Date;
}

export interface TradeDashboardActionCandidate {
  id: string;
  counterpartyName: string;
  otherConfirmed: boolean;
  updatedAt: Date;
}

export interface ResearchDashboardActionCandidate {
  id: string;
  outputName: string;
  claimDeadline: Date;
  updatedAt: Date;
}

interface WorkshopProjectionRow {
  _id: string;
  kind: EquipmentWorkshopRequestDoc["kind"];
  userId: string;
  characterId: string;
  characterCodename: string;
  equipmentName?: string;
  sourceItemId?: string;
  sourceSlot?: EquipmentWorkshopRequestDoc["sourceSlot"];
  status: EquipmentWorkshopRequestDoc["status"];
  quote?: {
    version: number;
    result: {
      name: string;
    };
  };
  escrow?: {
    sourceItemId?: string;
    sourceSlot?: EquipmentWorkshopRequestDoc["sourceSlot"];
  };
  startedAt?: Date;
  readyAt?: Date;
  updatedAt: Date;
}

interface TradeProjectionRow {
  _id: NonNullable<PlayerTrade["_id"]>;
  revision: number;
  initiator: PlayerTrade["initiator"];
  counterparty: PlayerTrade["counterparty"];
  initiatorConfirmedRevision?: number;
  counterpartyConfirmedRevision?: number;
  updatedAt: Date;
}

type ResearchProjectionRow = Pick<
  ResearchLabJob,
  | "requesterUserId"
  | "characterId"
  | "destination"
  | "status"
  | "output"
  | "claimDeadline"
  | "updatedAt"
> & { _id: NonNullable<ResearchLabJob["_id"]> };

const WORKSHOP_PROJECTION = {
  _id: 1,
  kind: 1,
  userId: 1,
  characterId: 1,
  characterCodename: 1,
  equipmentName: 1,
  sourceItemId: 1,
  sourceSlot: 1,
  status: 1,
  "quote.version": 1,
  "quote.result.name": 1,
  "escrow.sourceItemId": 1,
  "escrow.sourceSlot": 1,
  startedAt: 1,
  readyAt: 1,
  updatedAt: 1,
} as const;

const TRADE_PROJECTION = {
  _id: 1,
  revision: 1,
  initiator: 1,
  counterparty: 1,
  initiatorConfirmedRevision: 1,
  counterpartyConfirmedRevision: 1,
  updatedAt: 1,
} as const;

const RESEARCH_PROJECTION = {
  _id: 1,
  requesterUserId: 1,
  characterId: 1,
  destination: 1,
  status: 1,
  "output.name": 1,
  claimDeadline: 1,
  updatedAt: 1,
} as const;

async function findWorkshopBucket(
  filter: Filter<EquipmentWorkshopRequestDoc>,
  sort: Record<string, 1 | -1>,
): Promise<{ count: number; rows: WorkshopProjectionRow[] }> {
  const collection = await equipmentWorkshopRequestsCol();
  const [count, rows] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter, { projection: WORKSHOP_PROJECTION })
      .sort(sort)
      .limit(DOMAIN_PREVIEW_LIMIT)
      .toArray(),
  ]);
  return {
    count,
    rows: rows as unknown as WorkshopProjectionRow[],
  };
}

function workshopSubject(row: WorkshopProjectionRow): string {
  return row.quote?.result.name ?? row.equipmentName ?? "장비 의뢰";
}

function hasValidBuildState(row: WorkshopProjectionRow): boolean {
  if (!row.quote || !row.startedAt || !row.readyAt || !row.escrow) return false;
  if (row.kind !== "upgrade") return true;
  return (
    row.escrow.sourceItemId === row.sourceItemId &&
    row.escrow.sourceSlot === row.sourceSlot
  );
}

async function findCompletedWorkshopBucket(input: {
  userId: string;
  mainCharacterId: string;
  now: Date;
}): Promise<{ count: number; rows: WorkshopProjectionRow[] }> {
  const [requests, votes] = await Promise.all([
    equipmentWorkshopRequestsCol(), bureaucratVotesCol(),
  ]);
  // 표결이 있는 제작은 표결 종료 후에만 개인 확인 업무다.
  // 같은 파이프라인에서 필터 → count/preview를 적용해 대기 건이 건수를 부풀리지 않게 한다.
  const [result] = await requests.aggregate<{
    count: Array<{ value: number }>;
    rows: WorkshopProjectionRow[];
  }>([
    { $match: {
      userId: input.userId,
      characterId: input.mainCharacterId,
      kind: { $in: [...BUILD_REQUEST_KINDS] },
      status: "IN_PROGRESS",
      readyAt: { $lte: input.now },
    } },
    { $lookup: {
      from: votes.collectionName,
      let: {
        voteId: { $convert: { input: "$approvalVoteId", to: "objectId", onError: null, onNull: null } },
        requestId: "$_id",
        version: "$quote.version",
      },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ["$_id", "$$voteId"] },
          { $eq: ["$source", "WORKSHOP"] },
          { $eq: ["$workshopRef.requestId", "$$requestId"] },
          { $eq: ["$workshopRef.quoteVersion", "$$version"] },
          { $eq: ["$status", "CLOSED"] },
        ] } } },
        { $project: { _id: 1 } },
      ],
      as: "resolvedApproval",
    } },
    { $match: { $or: [
      { "quote.approvalGate": { $exists: false } },
      { "resolvedApproval.0": { $exists: true } },
    ] } },
    { $facet: {
      count: [{ $count: "value" }],
      rows: [{ $sort: { readyAt: 1, _id: 1 } }, { $limit: DOMAIN_PREVIEW_LIMIT }, { $project: WORKSHOP_PROJECTION }],
    } },
  ]).toArray();
  return { count: result?.count[0]?.value ?? 0, rows: result?.rows ?? [] };
}

export async function readDashboardWorkshopActions(input: {
  userId: string;
  mainCharacterId: string | null;
  includeAdmin: boolean;
  now: Date;
}): Promise<DashboardActionBatch<WorkshopDashboardActionCandidate>> {
  const empty = { count: 0, rows: [] };

  const [quoted, completed, requested, inReview] = await Promise.all([
    input.mainCharacterId
      ? findWorkshopBucket(
          {
            userId: input.userId,
            characterId: input.mainCharacterId,
            kind: { $in: [...BUILD_REQUEST_KINDS] },
            status: "QUOTED",
          },
          { updatedAt: 1, _id: 1 },
        )
      : empty,
    input.mainCharacterId
      ? findCompletedWorkshopBucket({ ...input, mainCharacterId: input.mainCharacterId })
      : empty,
    input.includeAdmin
      ? findWorkshopBucket({ status: "REQUESTED" }, { createdAt: 1, _id: 1 })
      : empty,
    input.includeAdmin
      ? findWorkshopBucket({ status: "IN_REVIEW" }, { updatedAt: 1, _id: 1 })
      : empty,
  ]);
  const items: WorkshopDashboardActionCandidate[] = [
    ...quoted.rows.map((row) => ({
      id: row._id,
      state: "OWNER_QUOTE" as const,
      characterCodename: row.characterCodename,
      subject: workshopSubject(row),
      updatedAt: row.updatedAt,
    })),
    ...completed.rows.map((row) => ({
      id: row._id,
      state: hasValidBuildState(row)
        ? "OWNER_COMPLETION_CHECK" as const
        : "OWNER_CONDITION_INVALID" as const,
      characterCodename: row.characterCodename,
      subject: workshopSubject(row),
      updatedAt: row.updatedAt,
    })),
    ...requested.rows.map((row) => ({
      id: row._id,
      state: "GM_REVIEW" as const,
      characterCodename: row.characterCodename,
      subject: workshopSubject(row),
      updatedAt: row.updatedAt,
    })),
    ...inReview.rows.map((row) => ({
      id: row._id,
      state: row.kind === "reload" ? "GM_RELOAD_APPROVAL" as const : "GM_QUOTE" as const,
      characterCodename: row.characterCodename,
      subject: workshopSubject(row),
      updatedAt: row.updatedAt,
    })),
  ];

  return {
    items,
    totalCount: quoted.count + completed.count + requested.count + inReview.count,
  };
}

export async function readDashboardTradeActions(input: {
  userId: string;
  mainCharacterId: string | null;
}): Promise<DashboardActionBatch<TradeDashboardActionCandidate>> {
  if (!input.mainCharacterId) return { items: [], totalCount: 0 };
  const confirmationFilter: Filter<PlayerTrade> = {
    kind: "EXCHANGE",
    status: "OPEN",
    $or: [
      {
        $and: [
          {
            "initiator.userId": input.userId,
            "initiator.characterId": input.mainCharacterId,
          },
          {
            $expr: {
              $ne: [
                { $ifNull: ["$initiatorConfirmedRevision", -1] },
                "$revision",
              ],
            },
          },
        ],
      },
      {
        $and: [
          {
            "counterparty.userId": input.userId,
            "counterparty.characterId": input.mainCharacterId,
          },
          {
            $expr: {
              $ne: [
                { $ifNull: ["$counterpartyConfirmedRevision", -1] },
                "$revision",
              ],
            },
          },
        ],
      },
    ],
  };
  const collection = await playerTradesCol();
  const [totalCount, rows] = await Promise.all([
    collection.countDocuments(confirmationFilter),
    collection
      .find(confirmationFilter, { projection: TRADE_PROJECTION })
      .sort({ updatedAt: 1, _id: 1 })
      .limit(DOMAIN_PREVIEW_LIMIT)
      .toArray(),
  ]);

  return {
    items: (rows as unknown as TradeProjectionRow[]).map((row) => {
      const isInitiator = row.initiator.userId === input.userId;
      return {
        id: String(row._id),
        counterpartyName: isInitiator
          ? row.counterparty.displayName
          : row.initiator.displayName,
        otherConfirmed:
          (isInitiator
            ? row.counterpartyConfirmedRevision
            : row.initiatorConfirmedRevision) === row.revision,
        updatedAt: row.updatedAt,
      };
    }),
    totalCount,
  };
}

export async function readDashboardResearchActions(input: {
  userId: string;
  mainCharacterId: string | null;
  now: Date;
}): Promise<DashboardActionBatch<ResearchDashboardActionCandidate>> {
  if (!input.mainCharacterId) return { items: [], totalCount: 0 };
  // 수령 API는 mutation flag만 요구한다. 생산 worker가 멈춰도 기존 산출물 수령은 가능하다.
  if (!isResearchLabMutationConfigured()) return { items: [], totalCount: 0 };
  const filter: Filter<ResearchLabJob> = {
    requesterUserId: input.userId,
    characterId: input.mainCharacterId,
    destination: "CHARACTER",
    status: "CLAIMABLE",
    claimDeadline: { $gt: input.now },
  };
  const collection = await researchLabJobsCol();
  const [totalCount, rows] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter, { projection: RESEARCH_PROJECTION })
      .sort({ claimDeadline: 1, _id: 1 })
      .limit(DOMAIN_PREVIEW_LIMIT)
      .toArray(),
  ]);

  return {
    items: (rows as unknown as ResearchProjectionRow[]).flatMap((row) =>
      row.claimDeadline
        ? [{
            id: String(row._id),
            outputName: row.output.name,
            claimDeadline: row.claimDeadline,
            updatedAt: row.updatedAt,
          }]
        : [],
    ),
    totalCount,
  };
}
