/**
 * MongoDB 연결 관리 (싱글톤)
 *
 * MongoClient를 한 번만 생성하고 재사용합니다.
 * @module db/client
 */

import { MongoClient, type MongoClientOptions } from "mongodb";
import { config } from "../config.js";

/** MongoDB 클라이언트 싱글톤 인스턴스 */
let client: MongoClient | null = null;

/**
 * MongoDB에 연결합니다.
 * 봇 시작 시 한 번 호출합니다.
 * @throws {Error} 연결 실패 시
 */
export async function connectDb(): Promise<void> {
  if (client) return;

  const options: MongoClientOptions = {};
  client = new MongoClient(config.mongoUri, options);
  await client.connect();
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
    throw new Error("DB가 연결되지 않았습니다. connectDb()를 먼저 호출하세요.");
  }
  return client;
}
