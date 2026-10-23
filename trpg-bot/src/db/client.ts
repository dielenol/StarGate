/**
 * MongoDB 연결 관리 — `@stargate/shared-db` long-running 모드 위임
 *
 * 봇 기동 시 한 번 연결하고 종료 시 닫는다. DB 이름은 통합 DB(`stargate`)이며
 * 테스트·스테이징만 `MONGODB_DB_NAME` 으로 바꾼다.
 *
 * @module db/client
 */

import {
  close as sharedClose,
  connect as sharedConnect,
} from "@stargate/shared-db";

import { config } from "../config.js";

/**
 * MongoDB 에 연결한다. 봇 시작 시 한 번 호출.
 *
 * - long-running 모드로 진입 (Discord bot 은 서버리스 아님).
 * 인덱스 생성은 배포 전 승인된 one-shot preflight에서만 수행한다.
 */
export async function connectDb(): Promise<void> {
  await sharedConnect({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    maxPoolSize: 10,
  });
}

/** MongoDB 연결을 종료합니다. 프로세스 종료 시 호출. */
export async function closeDb(): Promise<void> {
  await sharedClose();
}
