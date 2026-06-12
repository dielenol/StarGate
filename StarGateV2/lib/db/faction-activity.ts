import "./init";

import { ObjectId } from "mongodb";

import { getDb } from "@stargate/shared-db";

const LOG_COLLECTION = "faction_relation_logs";
const QUEST_COLLECTION = "faction_quest_progress";

export type FactionActivityKind =
  | "ACTION"
  | "SUPPORT"
  | "QUEST_ACCEPT"
  | "QUEST_COMPLETE";

export type FactionQuestProgressStatus = "ACTIVE" | "COMPLETED";

export interface FactionRelationLogDoc {
  _id?: ObjectId;
  code: string;
  kind: FactionActivityKind;
  title: string;
  detail: string;
  delta: number;
  favorabilityBefore: number;
  favorabilityAfter: number;
  actorId: string;
  actorName: string;
  createdAt: Date;
  characterId?: string;
  characterCodename?: string;
  creditCost?: number;
  creditTransactionId?: string;
  questId?: string;
}

export interface FactionQuestProgressDoc {
  _id?: ObjectId;
  code: string;
  questId: string;
  status: FactionQuestProgressStatus;
  title: string;
  actorId: string;
  actorName: string;
  startedAt: Date;
  updatedAt: Date;
  characterId?: string;
  characterCodename?: string;
  completedAt?: Date;
}

async function factionRelationLogsCol() {
  const db = await getDb();
  return db.collection<FactionRelationLogDoc>(LOG_COLLECTION);
}

async function factionQuestProgressCol() {
  const db = await getDb();
  return db.collection<FactionQuestProgressDoc>(QUEST_COLLECTION);
}

export async function listFactionRelationLogs(
  code: string,
  limit = 12,
): Promise<FactionRelationLogDoc[]> {
  const col = await factionRelationLogsCol();
  return col
    .find({ code })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function createFactionRelationLog(
  input: Omit<FactionRelationLogDoc, "_id" | "createdAt">,
): Promise<FactionRelationLogDoc> {
  const col = await factionRelationLogsCol();
  const doc: FactionRelationLogDoc = {
    ...input,
    createdAt: new Date(),
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listFactionQuestProgress(
  code: string,
): Promise<FactionQuestProgressDoc[]> {
  const col = await factionQuestProgressCol();
  return col.find({ code }).sort({ updatedAt: -1 }).toArray();
}

export async function findFactionQuestProgress(
  code: string,
  questId: string,
): Promise<FactionQuestProgressDoc | null> {
  const col = await factionQuestProgressCol();
  return col.findOne({ code, questId });
}

export async function setFactionQuestProgress(input: {
  code: string;
  questId: string;
  status: FactionQuestProgressStatus;
  title: string;
  actorId: string;
  actorName: string;
  characterId?: string;
  characterCodename?: string;
}): Promise<FactionQuestProgressDoc> {
  const col = await factionQuestProgressCol();
  const now = new Date();
  const update = {
    $set: {
      code: input.code,
      questId: input.questId,
      status: input.status,
      title: input.title,
      actorId: input.actorId,
      actorName: input.actorName,
      updatedAt: now,
      ...(input.characterId ? { characterId: input.characterId } : {}),
      ...(input.characterCodename
        ? { characterCodename: input.characterCodename }
        : {}),
      ...(input.status === "COMPLETED" ? { completedAt: now } : {}),
    },
    $setOnInsert: {
      startedAt: now,
    },
  };

  await col.updateOne({ code: input.code, questId: input.questId }, update, {
    upsert: true,
  });

  const saved = await col.findOne({ code: input.code, questId: input.questId });
  if (!saved) {
    throw new Error("faction quest progress upsert failed");
  }

  return saved;
}
