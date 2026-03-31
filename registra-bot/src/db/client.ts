/**
 * MongoDB 연결 관리 (싱글톤)
 *
 * MongoClient를 한 번만 생성하고 재사용합니다.
 * @module db/client
 */

import {
  MongoClient,
  MongoServerError,
  type MongoClientOptions,
} from "mongodb";
import { DbErr } from "../constants/registrar-voice.js";
import { config } from "../config.js";

/** MongoDB 클라이언트 싱글톤 인스턴스 */
let client: MongoClient | null = null;
let connectPromise: Promise<void> | null = null;

const DB_NAME = config.mongoDbName;
const SESSIONS_COLLECTION = "sessions";
const RESPONSES_COLLECTION = "session_responses";
const SESSION_LOGS_COLLECTION = "session_logs";
const REGISTRAR_USER_TIPS_COLLECTION = "registrar_user_tips";

async function ensureIndexes(mongoClient: MongoClient): Promise<void> {
  const db = mongoClient.db(DB_NAME);

  await Promise.all([
    db.collection(SESSIONS_COLLECTION).createIndexes([
      {
        key: { status: 1, closeDateTime: 1 },
        name: "sessions_status_closeDateTime",
      },
      {
        key: { guildId: 1, status: 1, createdAt: -1 },
        name: "sessions_guild_status_createdAt",
      },
      {
        key: { guildId: 1, status: 1, targetDateTime: 1 },
        name: "sessions_guild_status_targetDateTime",
      },
      {
        key: { status: 1, targetDateTime: 1, sessionStartReminder24hSent: 1 },
        name: "sessions_status_targetDateTime_reminderFlag",
      },
    ]),
    db.collection(RESPONSES_COLLECTION).createIndexes([
      {
        key: { sessionId: 1, userId: 1 },
        name: "responses_sessionId_userId_unique",
        unique: true,
      },
      {
        key: { sessionId: 1, status: 1 },
        name: "responses_sessionId_status",
      },
      {
        key: { userId: 1, status: 1 },
        name: "responses_userId_status",
      },
    ]),
    db
      .collection(SESSION_LOGS_COLLECTION)
      .createIndex(
        { sessionId: 1, createdAt: -1 },
        { name: "session_logs_sessionId_createdAt" }
      ),
    db.collection(REGISTRAR_USER_TIPS_COLLECTION).createIndex(
      { guildId: 1, userId: 1, tipId: 1 },
      {
        unique: true,
        name: "registrar_user_tips_guild_user_tip_unique",
      }
    ),
  ]);
}

/**
 * MongoDB에 연결합니다.
 * 봇 시작 시 한 번 호출합니다.
 * @throws {Error} 연결 실패 시
 */
export async function connectDb(): Promise<void> {
  if (client) return;
  if (connectPromise) return connectPromise;

  const options: MongoClientOptions = {};
  const mongoClient = new MongoClient(config.mongoUri, options);

  connectPromise = (async () => {
    try {
      await mongoClient.connect();
      await ensureIndexes(mongoClient);
      client = mongoClient;
    } catch (err) {
      await mongoClient.close().catch(() => {});
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new Error(DbErr.indexDup);
      }
      throw err;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * MongoDB 연결을 종료합니다.
 * 프로세스 종료 시 호출합니다.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

/**
 * MongoDB 클라이언트를 반환합니다.
 * connectDb() 호출 후에만 사용합니다.
 * @returns MongoClient
 * @throws {Error} connectDb() 미호출 시
 */
export function getClient(): MongoClient {
  if (!client) {
    throw new Error(DbErr.notConnected);
  }
  return client;
}
