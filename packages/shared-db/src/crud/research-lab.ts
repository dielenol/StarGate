import { randomUUID } from "node:crypto";

import {
  MongoServerError,
  ObjectId,
  type ClientSession,
  type Filter,
} from "mongodb";

import { getClient } from "../client.js";
import {
  characterInventoryCol,
  npcConversationsCol,
  npcRelationshipEventsCol,
  npcRelationshipsCol,
  researchLabJobsCol,
  researchLabLinesCol,
  sharedInventoryCol,
} from "../collections.js";
import type {
  NpcConversation,
  NpcConversationMessage,
  NpcRelationship,
  ResearchJobStatus,
  ResearchLabJob,
  ResearchLabLine,
  ResearchRecipeId,
  RelationshipState,
} from "../types/research-lab.js";
import {
  RESEARCH_CLAIM_REMINDER_LEAD_MS,
  RESEARCH_CLAIM_WINDOW_MS,
  RESEARCH_REPEAT_DURATION_MS,
} from "../types/research-lab.js";
import { addToInventory, addToSharedInventory } from "./inventory.js";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_SUMMARY_LEASE_MS = 60_000;
const DEFAULT_CONVERSATION_TURN_LEASE_MS = 30_000;
export const RESEARCH_LAB_MAX_WORKER_ATTEMPTS = 8;
const MAX_ERROR_LENGTH = 1_000;

function requireTransaction(session: ClientSession, action: string): void {
  if (!session.inTransaction()) {
    throw new Error(`${action}: transaction 중인 ClientSession이 필요합니다.`);
  }
}

export function researchOutstandingKey(
  characterId: string,
  recipeId: ResearchRecipeId,
): string {
  return `${characterId}:${recipeId}`;
}

export function npcRelationshipId(
  userId: string,
  characterId: string,
): string {
  return `XENO:${userId}:${characterId}`;
}

export function npcConversationId(
  userId: string,
  characterId: string,
): string {
  return `XENO:${userId}:${characterId}`;
}

export function npcRelationshipSceneDedupeKey(
  userId: string,
  characterId: string,
  sceneId: string,
): string {
  return `XENO:${userId}:${characterId}:scene:${sceneId}`;
}

export function relationshipStateForScore(score: number): RelationshipState {
  if (score <= -76) return "CONTEMPT";
  if (score <= -51) return "HOSTILE";
  if (score <= -26) return "DISPLEASED";
  if (score <= -6) return "COLD";
  if (score <= 5) return "NEUTRAL";
  if (score <= 25) return "OBSERVING";
  if (score <= 50) return "ACKNOWLEDGED";
  if (score <= 75) return "FAVORABLE";
  return "DELIGHTED";
}

export function clampRelationshipScore(score: number): number {
  return Math.max(-100, Math.min(100, Math.trunc(score)));
}

export async function listResearchLabLines(): Promise<ResearchLabLine[]> {
  return (await researchLabLinesCol()).find().sort({ _id: 1 }).toArray();
}

export async function listResearchLabJobs(input: {
  requesterUserId?: string;
  recipeId?: ResearchRecipeId;
  statuses?: ResearchJobStatus[];
  limit?: number;
} = {}): Promise<ResearchLabJob[]> {
  const filter: Filter<ResearchLabJob> = {
    ...(input.requesterUserId
      ? { requesterUserId: input.requesterUserId }
      : {}),
    ...(input.recipeId ? { recipeId: input.recipeId } : {}),
    ...(input.statuses?.length
      ? { status: { $in: input.statuses } }
      : {}),
  };
  return (await researchLabJobsCol())
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)))
    .toArray();
}

export async function findResearchLabJob(
  id: string,
  options: { session?: ClientSession } = {},
): Promise<ResearchLabJob | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await researchLabJobsCol()).findOne(
    { _id: new ObjectId(id) },
    { session: options.session },
  );
}

export async function insertInitialResearchLabState(input: {
  line: ResearchLabLine;
  job: ResearchLabJob;
  session: ClientSession;
}): Promise<ResearchLabJob> {
  requireTransaction(input.session, "insertInitialResearchLabState");
  const result = await (await researchLabJobsCol()).insertOne(input.job, {
    session: input.session,
  });
  const job = { ...input.job, _id: result.insertedId };
  await (await researchLabLinesCol()).insertOne(
    { ...input.line, initialJobId: result.insertedId.toHexString() },
    { session: input.session },
  );
  return job;
}

export async function insertResearchLabJob(
  job: ResearchLabJob,
  session: ClientSession,
): Promise<ResearchLabJob> {
  requireTransaction(session, "insertResearchLabJob");
  const result = await (await researchLabJobsCol()).insertOne(job, { session });
  return { ...job, _id: result.insertedId };
}

export async function startNextResearchLabJob(input: {
  recipeId: ResearchRecipeId;
  now: Date;
  session: ClientSession;
}): Promise<ResearchLabJob | null> {
  requireTransaction(input.session, "startNextResearchLabJob");
  const jobs = await researchLabJobsCol();
  const active = await jobs.findOne(
    { recipeId: input.recipeId, activeLineKey: input.recipeId },
    { session: input.session, projection: { _id: 1 } },
  );
  if (active) return null;
  const next = await jobs.findOneAndUpdate(
    { recipeId: input.recipeId, status: "QUEUED" },
    {
      $set: {
        status: "RUNNING",
        activeLineKey: input.recipeId,
        startedAt: input.now,
        completesAt: new Date(
          input.now.getTime() + RESEARCH_REPEAT_DURATION_MS,
        ),
        updatedAt: input.now,
      },
    },
    {
      sort: { queuedAt: 1, _id: 1 },
      returnDocument: "after",
      session: input.session,
    },
  );
  return next;
}

export async function startIdleResearchLabJobs(
  now: Date = new Date(),
): Promise<ResearchLabJob[]> {
  const queuedRecipes = await (await researchLabJobsCol()).distinct(
    "recipeId",
    { status: "QUEUED" },
  );
  const started: ResearchLabJob[] = [];
  for (const recipeId of queuedRecipes) {
    const client = await getClient();
    const session = client.startSession();
    try {
      let next: ResearchLabJob | null = null;
      await session.withTransaction(async () => {
        next = await startNextResearchLabJob({ recipeId, now, session });
      });
      if (next) started.push(next);
    } finally {
      await session.endSession();
    }
  }
  return started;
}

export async function cancelQueuedResearchLabJob(input: {
  id: string;
  requesterUserId: string;
  now: Date;
  session: ClientSession;
}): Promise<ResearchLabJob | null> {
  requireTransaction(input.session, "cancelQueuedResearchLabJob");
  if (!ObjectId.isValid(input.id)) return null;
  return (await researchLabJobsCol()).findOneAndUpdate(
    {
      _id: new ObjectId(input.id),
      requesterUserId: input.requesterUserId,
      status: "QUEUED",
    },
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: input.now,
        refundedAt: input.now,
        updatedAt: input.now,
      },
      $unset: { outstandingKey: "" },
    },
    { returnDocument: "after", session: input.session },
  );
}

async function grantResearchOutput(
  job: ResearchLabJob,
  destination: "SHARED" | "CHARACTER",
  now: Date,
  session: ClientSession,
): Promise<void> {
  if (destination === "SHARED") {
    await addToSharedInventory(
      {
        scope: "GLOBAL",
        itemId: job.output.itemId,
        itemName: job.output.name,
        quantity: job.output.quantity,
        acquiredAt: now,
        note: `연구소 ${job.recipeId} 작업 ${String(job._id)} 산출물`,
      },
      { session },
    );
    return;
  }
  await addToInventory(
    {
      characterId: job.characterId,
      characterCodename: job.characterCodename,
      itemId: job.output.itemId,
      itemName: job.output.name,
      quantity: job.output.quantity,
      acquiredAt: now,
      note: `연구소 ${job.recipeId} 작업 ${String(job._id)} 수령`,
    },
    { session },
  );
}

export type ResearchLabWorkerTransition =
  | "INITIAL_COMPLETED"
  | "SHARED_COMPLETED"
  | "CHARACTER_CLAIMABLE"
  | "CHARACTER_DIVERTED";

export interface ResearchLabWorkerResult {
  job: ResearchLabJob;
  transition: ResearchLabWorkerTransition;
  nextJob: ResearchLabJob | null;
}

export async function claimDueResearchLabJob(input: {
  now?: Date;
  leaseMs?: number;
} = {}): Promise<ResearchLabJob | null> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs!
    : DEFAULT_LEASE_MS;
  const leaseToken = randomUUID();
  return (await researchLabJobsCol()).findOneAndUpdate(
    {
      $and: [
        {
          $or: [
            { status: "RUNNING", completesAt: { $lte: now } },
            { status: "CLAIMABLE", claimDeadline: { $lte: now } },
          ],
        },
        { workerHaltedAt: { $exists: false } },
        { attempts: { $lt: RESEARCH_LAB_MAX_WORKER_ATTEMPTS } },
        {
          $or: [
            { leaseUntil: { $exists: false } },
            { leaseUntil: { $lte: now } },
          ],
        },
        {
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        leaseToken,
        leaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
      $inc: { attempts: 1 },
      $unset: { lastError: "", nextAttemptAt: "" },
    },
    {
      sort: { completesAt: 1, claimDeadline: 1, queuedAt: 1, _id: 1 },
      returnDocument: "after",
    },
  );
}

export async function haltExhaustedResearchLabJobs(
  now: Date = new Date(),
): Promise<number> {
  const result = await (await researchLabJobsCol()).updateMany(
    {
      workerHaltedAt: { $exists: false },
      attempts: { $gte: RESEARCH_LAB_MAX_WORKER_ATTEMPTS },
      leaseUntil: { $lte: now },
      $or: [
        { status: "RUNNING", completesAt: { $lte: now } },
        { status: "CLAIMABLE", claimDeadline: { $lte: now } },
      ],
    },
    {
      $set: {
        workerHaltedAt: now,
        lastError: "연구 작업이 8회 연속 실패해 자동 재시도를 안전정지했습니다.",
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "", nextAttemptAt: "" },
    },
  );
  return result.modifiedCount;
}

export async function countHaltedResearchLabJobs(): Promise<number> {
  return (await researchLabJobsCol()).countDocuments({
    workerHaltedAt: { $exists: true },
    status: { $in: ["RUNNING", "CLAIMABLE"] },
  });
}

export async function releaseResearchLabJobLease(input: {
  id: string | ObjectId;
  leaseToken: string;
  error: unknown;
  now?: Date;
}): Promise<"RETRY" | "HALTED" | null> {
  const now = input.now ?? new Date();
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const message = input.error instanceof Error
    ? input.error.message
    : String(input.error);
  const job = await (await researchLabJobsCol()).findOne(
    { _id: id, leaseToken: input.leaseToken },
    { projection: { attempts: 1 } },
  );
  if (!job) return null;
  const halted = job.attempts >= RESEARCH_LAB_MAX_WORKER_ATTEMPTS;
  const result = await (await researchLabJobsCol()).updateOne(
    { _id: id, leaseToken: input.leaseToken },
    {
      $set: {
        lastError: message.slice(0, MAX_ERROR_LENGTH),
        ...(halted
          ? { workerHaltedAt: now }
          : { nextAttemptAt: new Date(now.getTime() + 30_000) }),
        updatedAt: now,
      },
      $unset: { leaseToken: "", leaseUntil: "" },
    },
  );
  return result.modifiedCount === 1 ? (halted ? "HALTED" : "RETRY") : null;
}

export async function processClaimedResearchLabJob(input: {
  id: string | ObjectId;
  leaseToken: string;
  now?: Date;
}): Promise<ResearchLabWorkerResult | null> {
  const now = input.now ?? new Date();
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const client = await getClient();
  const session = client.startSession();
  let outcome: ResearchLabWorkerResult | null = null;
  try {
    await session.withTransaction(async () => {
      const jobs = await researchLabJobsCol();
      const job = await jobs.findOne(
        {
          _id: id,
          leaseToken: input.leaseToken,
          leaseUntil: { $gt: now },
        },
        { session },
      );
      if (!job) return;

      let transition: ResearchLabWorkerTransition;
      let finalJob: ResearchLabJob | null;
      let laneFreed = false;
      if (job.status === "RUNNING") {
        if (!job.completesAt || job.completesAt > now) return;
        if (job.kind === "REPEAT" && job.destination === "CHARACTER") {
          const claimDeadline = new Date(now.getTime() + RESEARCH_CLAIM_WINDOW_MS);
          finalJob = await jobs.findOneAndUpdate(
            { _id: id, status: "RUNNING", leaseToken: input.leaseToken },
            {
              $set: {
                status: "CLAIMABLE",
                claimDeadline,
                claimReminderAt: new Date(
                  claimDeadline.getTime() - RESEARCH_CLAIM_REMINDER_LEAD_MS,
                ),
                attempts: 0,
                updatedAt: now,
              },
              $push: { pendingSignals: "CHARACTER_CLAIMABLE" },
              $unset: { leaseToken: "", leaseUntil: "", nextAttemptAt: "" },
            },
            { returnDocument: "after", session },
          );
          transition = "CHARACTER_CLAIMABLE";
        } else {
          await grantResearchOutput(job, "SHARED", now, session);
          finalJob = await jobs.findOneAndUpdate(
            { _id: id, status: "RUNNING", leaseToken: input.leaseToken },
            {
              $set: {
                status: "COMPLETED",
                inventoryGrantedAt: now,
                completedAt: now,
                updatedAt: now,
              },
              $push: {
                pendingSignals:
                  job.kind === "INITIAL"
                    ? "INITIAL_COMPLETED"
                    : "SHARED_COMPLETED",
              },
              $unset: {
                outstandingKey: "",
                activeLineKey: "",
                leaseToken: "",
                leaseUntil: "",
                nextAttemptAt: "",
              },
            },
            { returnDocument: "after", session },
          );
          laneFreed = true;
          if (job.kind === "INITIAL") {
            const lineResult = await (await researchLabLinesCol()).updateOne(
              {
                _id: job.recipeId,
                status: "INITIAL_RESEARCH",
                initialJobId: id.toHexString(),
              },
              {
                $set: { status: "OPEN", openedAt: now, updatedAt: now },
              },
              { session },
            );
            if (lineResult.modifiedCount !== 1) {
              throw new Error("최초 연구선 OPEN 상태 전이에 실패했습니다.");
            }
            transition = "INITIAL_COMPLETED";
          } else {
            transition = "SHARED_COMPLETED";
          }
        }
      } else if (job.status === "CLAIMABLE") {
        if (!job.claimDeadline || job.claimDeadline > now) return;
        await grantResearchOutput(job, "SHARED", now, session);
        finalJob = await jobs.findOneAndUpdate(
          {
            _id: id,
            status: "CLAIMABLE",
            leaseToken: input.leaseToken,
            $and: [
              {
                $or: [
                  { signalLeaseToken: { $exists: false } },
                  { signalLeaseUntil: { $lte: now } },
                ],
              },
              {
                $or: [
                  { reminderLeaseToken: { $exists: false } },
                  { reminderLeaseUntil: { $lte: now } },
                ],
              },
            ],
          },
          {
            $set: {
              status: "DIVERTED_SHARED",
              inventoryGrantedAt: now,
              completedAt: now,
              pendingSignals: ["CHARACTER_DIVERTED"],
              updatedAt: now,
            },
            $unset: {
              outstandingKey: "",
              activeLineKey: "",
              leaseToken: "",
              leaseUntil: "",
              nextAttemptAt: "",
              signalLeaseToken: "",
              signalLeaseUntil: "",
              claimReminderAt: "",
              claimReminderSentAt: "",
              reminderLeaseToken: "",
              reminderLeaseUntil: "",
            },
          },
          { returnDocument: "after", session },
        );
        laneFreed = true;
        transition = "CHARACTER_DIVERTED";
      } else {
        return;
      }
      if (!finalJob) throw new Error("연구 작업 상태 CAS에 실패했습니다.");
      const nextJob = laneFreed
        ? await startNextResearchLabJob({
            recipeId: job.recipeId,
            now,
            session,
          })
        : null;
      outcome = { job: finalJob, transition, nextJob };
    });
    return outcome;
  } finally {
    await session.endSession();
  }
}

export async function claimDueResearchLabReminder(input: {
  now?: Date;
  leaseMs?: number;
} = {}): Promise<ResearchLabJob | null> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs!
    : DEFAULT_LEASE_MS;
  return (await researchLabJobsCol()).findOneAndUpdate(
    {
      status: "CLAIMABLE",
      claimReminderAt: { $lte: now },
      claimDeadline: { $gt: now },
      claimReminderSentAt: { $exists: false },
      $or: [
        { reminderLeaseUntil: { $exists: false } },
        { reminderLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        reminderLeaseToken: randomUUID(),
        reminderLeaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    },
    { sort: { claimReminderAt: 1, _id: 1 }, returnDocument: "after" },
  );
}

export async function claimDueResearchLabSignal(input: {
  now?: Date;
  leaseMs?: number;
} = {}): Promise<ResearchLabJob | null> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs!
    : DEFAULT_LEASE_MS;
  return (await researchLabJobsCol()).findOneAndUpdate(
    {
      "pendingSignals.0": { $exists: true },
      $or: [
        { signalLeaseUntil: { $exists: false } },
        { signalLeaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        signalLeaseToken: randomUUID(),
        signalLeaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    },
    { sort: { updatedAt: 1, _id: 1 }, returnDocument: "after" },
  );
}

export async function renewResearchLabSignalLease(input: {
  id: string | ObjectId;
  signalLeaseToken: string;
  expectedSignal: ResearchLabWorkerTransition;
  now?: Date;
  leaseMs?: number;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs!
    : DEFAULT_LEASE_MS;
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    {
      _id: id,
      "pendingSignals.0": input.expectedSignal,
      signalLeaseToken: input.signalLeaseToken,
      ...(input.expectedSignal === "CHARACTER_CLAIMABLE"
        ? {
            status: "CLAIMABLE" as const,
            claimDeadline: { $gt: now },
          }
        : {}),
    },
    {
      $set: {
        signalLeaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function completeResearchLabSignal(input: {
  id: string | ObjectId;
  signalLeaseToken: string;
  expectedSignal: ResearchLabWorkerTransition;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    {
      _id: id,
      "pendingSignals.0": input.expectedSignal,
      signalLeaseToken: input.signalLeaseToken,
      signalLeaseUntil: { $gt: now },
    },
    {
      $set: { signalSentAt: now, updatedAt: now },
      $pop: { pendingSignals: -1 },
      $unset: { signalLeaseToken: "", signalLeaseUntil: "" },
    },
  );
  if (result.modifiedCount === 1) return true;
  if (input.expectedSignal !== "CHARACTER_CLAIMABLE") return false;
  const current = await (await researchLabJobsCol()).findOne({ _id: id });
  return Boolean(
    current &&
      current.status !== "CLAIMABLE" &&
      !current.pendingSignals?.includes("CHARACTER_CLAIMABLE"),
  );
}

export async function releaseResearchLabSignalLease(input: {
  id: string | ObjectId;
  signalLeaseToken: string;
}): Promise<boolean> {
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    { _id: id, signalLeaseToken: input.signalLeaseToken },
    { $unset: { signalLeaseToken: "", signalLeaseUntil: "" } },
  );
  return result.modifiedCount === 1;
}

export async function renewResearchLabReminderLease(input: {
  id: string | ObjectId;
  reminderLeaseToken: string;
  now?: Date;
  leaseMs?: number;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const leaseMs = Number.isSafeInteger(input.leaseMs) && (input.leaseMs ?? 0) > 0
    ? input.leaseMs!
    : DEFAULT_LEASE_MS;
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    {
      _id: id,
      status: "CLAIMABLE",
      claimDeadline: { $gt: now },
      reminderLeaseToken: input.reminderLeaseToken,
    },
    {
      $set: {
        reminderLeaseUntil: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function completeResearchLabReminder(input: {
  id: string | ObjectId;
  reminderLeaseToken: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    {
      _id: id,
      status: "CLAIMABLE",
      reminderLeaseToken: input.reminderLeaseToken,
      reminderLeaseUntil: { $gt: now },
    },
    {
      $set: { claimReminderSentAt: now, updatedAt: now },
      $unset: { reminderLeaseToken: "", reminderLeaseUntil: "" },
    },
  );
  if (result.modifiedCount === 1) return true;
  const current = await (await researchLabJobsCol()).findOne({ _id: id });
  return Boolean(
    current &&
      current.status !== "CLAIMABLE" &&
      current.reminderLeaseToken === undefined,
  );
}

export async function releaseResearchLabReminderLease(input: {
  id: string | ObjectId;
  reminderLeaseToken: string;
}): Promise<boolean> {
  const id = typeof input.id === "string" ? new ObjectId(input.id) : input.id;
  const result = await (await researchLabJobsCol()).updateOne(
    { _id: id, reminderLeaseToken: input.reminderLeaseToken },
    { $unset: { reminderLeaseToken: "", reminderLeaseUntil: "" } },
  );
  return result.modifiedCount === 1;
}

export async function claimResearchLabCharacterOutput(input: {
  id: string;
  requesterUserId: string;
  characterId: string;
  now: Date;
  session: ClientSession;
}): Promise<{ job: ResearchLabJob; nextJob: ResearchLabJob | null } | null> {
  requireTransaction(input.session, "claimResearchLabCharacterOutput");
  if (!ObjectId.isValid(input.id)) return null;
  const jobs = await researchLabJobsCol();
  const job = await jobs.findOne(
    {
      _id: new ObjectId(input.id),
      requesterUserId: input.requesterUserId,
      characterId: input.characterId,
      status: "CLAIMABLE",
      claimDeadline: { $gt: input.now },
      leaseUntil: { $exists: false },
      $and: [
        {
          $or: [
            { signalLeaseToken: { $exists: false } },
            { signalLeaseUntil: { $lte: input.now } },
          ],
        },
        {
          $or: [
            { reminderLeaseToken: { $exists: false } },
            { reminderLeaseUntil: { $lte: input.now } },
          ],
        },
      ],
    },
    { session: input.session },
  );
  if (!job) return null;
  await grantResearchOutput(job, "CHARACTER", input.now, input.session);
  const completed = await jobs.findOneAndUpdate(
    {
      _id: job._id,
      requesterUserId: input.requesterUserId,
      characterId: input.characterId,
      status: "CLAIMABLE",
      claimDeadline: { $gt: input.now },
      leaseUntil: { $exists: false },
      $and: [
        {
          $or: [
            { signalLeaseToken: { $exists: false } },
            { signalLeaseUntil: { $lte: input.now } },
          ],
        },
        {
          $or: [
            { reminderLeaseToken: { $exists: false } },
            { reminderLeaseUntil: { $lte: input.now } },
          ],
        },
      ],
    },
    {
      $set: {
        status: "COMPLETED",
        inventoryGrantedAt: input.now,
        completedAt: input.now,
        updatedAt: input.now,
      },
      $pull: { pendingSignals: "CHARACTER_CLAIMABLE" },
      $unset: {
        outstandingKey: "",
        activeLineKey: "",
        signalLeaseToken: "",
        signalLeaseUntil: "",
        claimReminderAt: "",
        claimReminderSentAt: "",
        reminderLeaseToken: "",
        reminderLeaseUntil: "",
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (!completed) throw new Error("개인 연구 산출물 claim CAS에 실패했습니다.");
  const nextJob = await startNextResearchLabJob({
    recipeId: job.recipeId,
    now: input.now,
    session: input.session,
  });
  return { job: completed, nextJob };
}

export async function getOrCreateNpcRelationship(input: {
  userId: string;
  characterId: string;
  initialScore: number;
  now?: Date;
}): Promise<NpcRelationship> {
  const now = input.now ?? new Date();
  const id = npcRelationshipId(input.userId, input.characterId);
  const existing = await (await npcRelationshipsCol()).findOne({
    _id: id,
    userId: input.userId,
    characterId: input.characterId,
  });
  if (existing) return existing;
  const score = clampRelationshipScore(input.initialScore);
  const relationship: NpcRelationship = {
    _id: id,
    npcId: "XENO",
    userId: input.userId,
    characterId: input.characterId,
    score,
    initializedAt: now,
    updatedAt: now,
    version: 1,
  };
  const client = await getClient();
  const session = client.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await (await npcRelationshipsCol()).insertOne(relationship, { session });
        await (await npcRelationshipEventsCol()).insertOne(
          {
            dedupeKey: `${id}:initial`,
            npcId: "XENO",
            userId: input.userId,
            characterId: input.characterId,
            kind: "INITIAL",
            delta: score,
            scoreAfter: score,
            createdAt: now,
            version: 1,
          },
          { session },
        );
      });
      return relationship;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11_000) {
        throw error;
      }
      const winner = await (await npcRelationshipsCol()).findOne({ _id: id });
      if (!winner) throw error;
      return winner;
    }
  } finally {
    await session.endSession();
  }
}

export async function applyNpcRelationshipChoice(input: {
  userId: string;
  characterId: string;
  sceneId: string;
  choiceId: string;
  delta: number;
  now?: Date;
}): Promise<{
  relationship: NpcRelationship;
  applied: boolean;
  choiceId: string;
}> {
  if (
    !input.sceneId.trim() ||
    !input.choiceId.trim() ||
    !Number.isInteger(input.delta) ||
    input.delta < -8 ||
    input.delta > 5
  ) {
    throw new Error("제노 관계 선택지 입력이 올바르지 않습니다.");
  }
  const now = input.now ?? new Date();
  const relationshipId = npcRelationshipId(input.userId, input.characterId);
  const dedupeKey = npcRelationshipSceneDedupeKey(
    input.userId,
    input.characterId,
    input.sceneId,
  );
  const existingEvent = await (await npcRelationshipEventsCol()).findOne({
    dedupeKey,
  });
  if (existingEvent) {
    if (!existingEvent.choiceId) {
      throw new Error("관계 선택 이벤트의 선택지 ID가 없습니다.");
    }
    const existingRelationship = await (await npcRelationshipsCol()).findOne({
      _id: relationshipId,
      userId: input.userId,
      characterId: input.characterId,
    });
    if (!existingRelationship) {
      throw new Error("관계 선택 이벤트와 현재 관계가 불일치합니다.");
    }
    return {
      relationship: existingRelationship,
      applied: false,
      choiceId: existingEvent.choiceId,
    };
  }

  const client = await getClient();
  const session = client.startSession();
  let result:
    | {
        relationship: NpcRelationship;
        applied: boolean;
        choiceId: string;
      }
    | undefined;
  try {
    try {
      await session.withTransaction(async () => {
        const events = await npcRelationshipEventsCol();
        const duplicate = await events.findOne({ dedupeKey }, { session });
        if (duplicate) {
          if (!duplicate.choiceId) {
            throw new Error("관계 선택 이벤트의 선택지 ID가 없습니다.");
          }
          const relationship = await (await npcRelationshipsCol()).findOne(
            { _id: relationshipId },
            { session },
          );
          if (!relationship) throw new Error("제노 관계가 초기화되지 않았습니다.");
          result = {
            relationship,
            applied: false,
            choiceId: duplicate.choiceId,
          };
          return;
        }
        const current = await (await npcRelationshipsCol()).findOne(
          {
            _id: relationshipId,
            npcId: "XENO",
            userId: input.userId,
            characterId: input.characterId,
          },
          { session },
        );
        if (!current) throw new Error("제노 관계가 초기화되지 않았습니다.");
        const scoreAfter = clampRelationshipScore(current.score + input.delta);
        const relationship = await (await npcRelationshipsCol()).findOneAndUpdate(
          {
            _id: relationshipId,
            userId: input.userId,
            characterId: input.characterId,
            score: current.score,
          },
          { $set: { score: scoreAfter, updatedAt: now } },
          { returnDocument: "after", session },
        );
        if (!relationship) {
          throw new MongoServerError({
            errmsg: "npc relationship CAS conflict",
            errorLabels: ["TransientTransactionError"],
          });
        }
        await events.insertOne(
          {
            dedupeKey,
            npcId: "XENO",
            userId: input.userId,
            characterId: input.characterId,
            kind: "CHOICE",
            sceneId: input.sceneId,
            choiceId: input.choiceId,
            delta: input.delta,
            scoreAfter,
            createdAt: now,
            version: 1,
          },
          { session },
        );
        result = {
          relationship,
          applied: true,
          choiceId: input.choiceId,
        };
      });
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11_000) {
        throw error;
      }
      const relationship = await (await npcRelationshipsCol()).findOne({
        _id: relationshipId,
        userId: input.userId,
        characterId: input.characterId,
      });
      if (!relationship) throw error;
      const winningEvent = await (await npcRelationshipEventsCol()).findOne({
        dedupeKey,
        userId: input.userId,
        characterId: input.characterId,
      });
      if (!winningEvent?.choiceId) throw error;
      result = {
        relationship,
        applied: false,
        choiceId: winningEvent.choiceId,
      };
    }
    if (!result) throw new Error("제노 관계 선택 반영 결과가 없습니다.");
    return result;
  } finally {
    await session.endSession();
  }
}

export type NpcConversationReservation =
  | {
      ok: true;
      conversation: NpcConversation;
      turnLease: { token: string; expiresAt: Date };
      summaryLease?: { token: string; generation: number };
    }
  | { ok: false; reason: "DAILY_LIMIT" | "COOLDOWN"; retryAt?: Date };

export async function reserveNpcConversationTurn(input: {
  userId: string;
  characterId: string;
  dailyUsageDate: string;
  now?: Date;
  dailyLimit?: number;
  cooldownMs?: number;
  turnLeaseMs?: number;
  summaryLeaseMs?: number;
}): Promise<NpcConversationReservation> {
  const now = input.now ?? new Date();
  const dailyLimit = input.dailyLimit ?? 30;
  const cooldownMs = input.cooldownMs ?? 5_000;
  const turnLeaseMs = input.turnLeaseMs ?? DEFAULT_CONVERSATION_TURN_LEASE_MS;
  const turnLeaseToken = randomUUID();
  const turnLeaseUntil = new Date(now.getTime() + turnLeaseMs);
  const summaryLeaseMs = input.summaryLeaseMs ?? DEFAULT_SUMMARY_LEASE_MS;
  const summaryLeaseToken = randomUUID();
  const summaryLeaseUntil = new Date(now.getTime() + summaryLeaseMs);
  const id = npcConversationId(input.userId, input.characterId);
  const conversations = await npcConversationsCol();
  const existing = await conversations.findOne({
    _id: id,
    userId: input.userId,
    characterId: input.characterId,
  });
  if (existing?.turnLeaseUntil && existing.turnLeaseUntil > now) {
    return {
      ok: false,
      reason: "COOLDOWN",
      retryAt: existing.turnLeaseUntil,
    };
  }
  if (
    existing?.lastUserMessageAt &&
    existing.lastUserMessageAt.getTime() + cooldownMs > now.getTime()
  ) {
    return {
      ok: false,
      reason: "COOLDOWN",
      retryAt: new Date(existing.lastUserMessageAt.getTime() + cooldownMs),
    };
  }
  const currentCount = existing?.dailyUsageDate === input.dailyUsageDate
    ? existing.dailyUsageCount
    : 0;
  if (currentCount >= dailyLimit) return { ok: false, reason: "DAILY_LIMIT" };

  let result: NpcConversation | null = null;
  try {
    result = await conversations.findOneAndUpdate(
      {
        _id: id,
        userId: input.userId,
        characterId: input.characterId,
        $and: [
          {
            $or: [
              { lastUserMessageAt: { $exists: false } },
              {
                lastUserMessageAt: {
                  $lte: new Date(now.getTime() - cooldownMs),
                },
              },
            ],
          },
          {
            $or: [
              { turnLeaseUntil: { $exists: false } },
              { turnLeaseUntil: { $lte: now } },
            ],
          },
        ],
        $expr: {
          $lt: [
            {
              $cond: [
                { $eq: ["$dailyUsageDate", input.dailyUsageDate] },
                "$dailyUsageCount",
                0,
              ],
            },
            dailyLimit,
          ],
        },
      },
      [
        {
          $set: {
            npcId: "XENO",
            userId: input.userId,
            characterId: input.characterId,
            summary: { $ifNull: ["$summary", ""] },
            messages: { $ifNull: ["$messages", []] },
            dailyUsageCount: {
              $add: [
                {
                  $cond: [
                    { $eq: ["$dailyUsageDate", input.dailyUsageDate] },
                    { $ifNull: ["$dailyUsageCount", 0] },
                    0,
                  ],
                },
                1,
              ],
            },
            totalUsageCount: {
              $add: [{ $ifNull: ["$totalUsageCount", 0] }, 1],
            },
            dailyUsageDate: input.dailyUsageDate,
            lastUserMessageAt: now,
            turnLeaseToken,
            turnLeaseUntil,
            summaryPending: { $ifNull: ["$summaryPending", false] },
            lastSummarizedUsageCount: {
              $ifNull: ["$lastSummarizedUsageCount", 0],
            },
            createdAt: { $ifNull: ["$createdAt", now] },
            updatedAt: now,
            version: 1,
          },
        },
        {
          $set: {
            summaryPending: {
              $or: [
                "$summaryPending",
                {
                  $gte: [
                    {
                      $subtract: [
                        "$totalUsageCount",
                        "$lastSummarizedUsageCount",
                      ],
                    },
                    10,
                  ],
                },
              ],
            },
            summaryGeneration: {
              $cond: [
                {
                  $and: [
                    {
                      $gte: [
                        {
                          $subtract: [
                            "$totalUsageCount",
                            "$lastSummarizedUsageCount",
                          ],
                        },
                        10,
                      ],
                    },
                    {
                      $or: [
                        { $eq: ["$summaryPending", false] },
                        {
                          $lte: [
                            {
                              $ifNull: [
                                "$summaryLeaseUntil",
                                new Date(0),
                              ],
                            },
                            now,
                          ],
                        },
                      ],
                    },
                  ],
                },
                "$totalUsageCount",
                "$summaryGeneration",
              ],
            },
            summaryLeaseToken: {
              $cond: [
                {
                  $and: [
                    {
                      $gte: [
                        {
                          $subtract: [
                            "$totalUsageCount",
                            "$lastSummarizedUsageCount",
                          ],
                        },
                        10,
                      ],
                    },
                    {
                      $or: [
                        { $eq: ["$summaryPending", false] },
                        {
                          $lte: [
                            {
                              $ifNull: [
                                "$summaryLeaseUntil",
                                new Date(0),
                              ],
                            },
                            now,
                          ],
                        },
                      ],
                    },
                  ],
                },
                summaryLeaseToken,
                "$summaryLeaseToken",
              ],
            },
            summaryLeaseUntil: {
              $cond: [
                {
                  $and: [
                    {
                      $gte: [
                        {
                          $subtract: [
                            "$totalUsageCount",
                            "$lastSummarizedUsageCount",
                          ],
                        },
                        10,
                      ],
                    },
                    {
                      $or: [
                        { $eq: ["$summaryPending", false] },
                        {
                          $lte: [
                            {
                              $ifNull: [
                                "$summaryLeaseUntil",
                                new Date(0),
                              ],
                            },
                            now,
                          ],
                        },
                      ],
                    },
                  ],
                },
                summaryLeaseUntil,
                "$summaryLeaseUntil",
              ],
            },
          },
        },
      ],
      { upsert: existing === null, returnDocument: "after" },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }
  }
  if (result) {
    return {
      ok: true,
      conversation: result,
      turnLease: { token: turnLeaseToken, expiresAt: turnLeaseUntil },
      ...(result.summaryLeaseToken === summaryLeaseToken &&
      typeof result.summaryGeneration === "number"
        ? {
            summaryLease: {
              token: summaryLeaseToken,
              generation: result.summaryGeneration,
            },
          }
        : {}),
    };
  }
  const current = await conversations.findOne({
    _id: id,
    userId: input.userId,
    characterId: input.characterId,
  });
  if (current?.turnLeaseUntil && current.turnLeaseUntil > now) {
    return {
      ok: false,
      reason: "COOLDOWN",
      retryAt: current.turnLeaseUntil,
    };
  }
  if (
    current?.lastUserMessageAt &&
    current.lastUserMessageAt.getTime() + cooldownMs > now.getTime()
  ) {
    return {
      ok: false,
      reason: "COOLDOWN",
      retryAt: new Date(current.lastUserMessageAt.getTime() + cooldownMs),
    };
  }
  return { ok: false, reason: "DAILY_LIMIT" };
}

export async function appendNpcConversationMessages(input: {
  userId: string;
  characterId: string;
  messages: NpcConversationMessage[];
  dailyUsageDate: string;
  turnLeaseToken: string;
  now?: Date;
}): Promise<NpcConversation> {
  const now = input.now ?? new Date();
  const id = npcConversationId(input.userId, input.characterId);
  const result = await (await npcConversationsCol()).findOneAndUpdate(
    {
      _id: id,
      userId: input.userId,
      characterId: input.characterId,
      turnLeaseToken: input.turnLeaseToken,
      turnLeaseUntil: { $gt: now },
    },
    {
      $set: {
        dailyUsageDate: input.dailyUsageDate,
        lastUserMessageAt: now,
        updatedAt: now,
      },
      $push: {
        messages: { $each: input.messages, $slice: -40 },
      },
      $unset: { turnLeaseToken: "", turnLeaseUntil: "" },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("제노 대화 저장에 실패했습니다.");
  return result;
}

export async function updateNpcConversationSummary(input: {
  userId: string;
  characterId: string;
  summary: string;
  summaryLeaseToken: string;
  summaryGeneration: number;
  now?: Date;
}): Promise<boolean> {
  if (input.summary.length > 4_000) {
    throw new Error("제노 대화 장기 요약은 4,000자를 넘을 수 없습니다.");
  }
  const result = await (await npcConversationsCol()).updateOne(
    {
      _id: npcConversationId(input.userId, input.characterId),
      userId: input.userId,
      characterId: input.characterId,
      summaryPending: true,
      summaryGeneration: input.summaryGeneration,
      summaryLeaseToken: input.summaryLeaseToken,
      summaryLeaseUntil: { $gt: input.now ?? new Date() },
    },
    [
      {
        $set: {
          summary: input.summary,
          messages: {
            $cond: [
              { $eq: ["$totalUsageCount", input.summaryGeneration] },
              { $slice: [{ $ifNull: ["$messages", []] }, -20] },
              { $ifNull: ["$messages", []] },
            ],
          },
          summaryPending: false,
          lastSummarizedUsageCount: input.summaryGeneration,
          summaryGeneration: "$$REMOVE",
          summaryLeaseToken: "$$REMOVE",
          summaryLeaseUntil: "$$REMOVE",
          updatedAt: input.now ?? new Date(),
        },
      },
    ],
  );
  return result.modifiedCount === 1;
}
