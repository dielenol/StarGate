/**
 * MongoDB 연결 관리 — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db의 connect/close를 직접 사용하세요.
 */

import type { MongoClient } from "mongodb";
import {
  connect as sharedConnect,
  close as sharedClose,
  getClientSync,
  ensureAllIndexes,
} from "@stargate/shared-db";
import { config } from "../config.js";

/** MongoDB에 연결합니다. */
export async function connectDb(): Promise<void> {
  await sharedConnect({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    maxPoolSize: 10,
  });
  await ensureAllIndexes();
}

/** MongoDB 연결을 종료합니다. */
export async function closeDb(): Promise<void> {
  await sharedClose();
}

/** MongoDB 클라이언트를 반환합니다. (connectDb 호출 후에만 사용) */
export function getClient(): MongoClient {
  return getClientSync();
}
