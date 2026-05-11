/**
 * MongoDB 연결 관리 — shared-db 로 이전됨 (shim)
 *
 * 자체 MongoClient 싱글톤을 제거하고 `@stargate/shared-db` 의 long-running
 * 모드 connect/close 와 sync accessor 를 위임한다. DB 이름은 통합 DB
 * (`stargate`) 로 전환 — 기존 `trpg_bot` 하드코딩은 제거.
 *
 * @deprecated 신규 호출처는 `@stargate/shared-db` 의 connect/close/getClientSync
 * 를 직접 사용하세요.
 * @module db/client
 */

import type { MongoClient } from "mongodb";
import {
  close as sharedClose,
  connect as sharedConnect,
  ensureAllIndexes,
  getClientSync,
} from "@stargate/shared-db";

import { config } from "../config.js";

/**
 * MongoDB 에 연결한다. 봇 시작 시 한 번 호출.
 *
 * - long-running 모드로 진입 (Discord bot 은 서버리스 아님).
 * - shared-db 통합 인덱스(`ensureAllIndexes`)를 함께 생성 — trpg_sessions,
 *   trpg_guild_members, trpg_session_notifications 포함.
 */
export async function connectDb(): Promise<void> {
  await sharedConnect({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    maxPoolSize: 10,
  });
  await ensureAllIndexes();
}

/** MongoDB 연결을 종료합니다. 프로세스 종료 시 호출. */
export async function closeDb(): Promise<void> {
  await sharedClose();
}

/**
 * MongoDB 클라이언트를 반환합니다. (`connectDb` 호출 후에만 사용)
 *
 * 기존 호출처 호환용 shim — sync getClientSync 를 위임.
 */
export function getClient(): MongoClient {
  return getClientSync();
}
