/**
 * MongoDB 클라이언트 — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db의 getClient/getDb를 직접 사용하세요.
 * 이 파일은 하위 호환성을 위해 유지됩니다.
 */

import "./init";

import type { Db, MongoClient } from "mongodb";
import { getClient as sharedGetClient, getDb as sharedGetDb } from "@stargate/shared-db";

export async function getClient(): Promise<MongoClient> {
  return sharedGetClient();
}

/**
 * @deprecated 통합 DB(`stargate`)를 사용하므로 ERP/Registrar 구분 없음.
 */
export async function getErpDb(): Promise<Db> {
  return sharedGetDb();
}

/**
 * @deprecated 통합 DB(`stargate`)를 사용하므로 ERP/Registrar 구분 없음.
 */
export async function getRegistrarDb(): Promise<Db> {
  return sharedGetDb();
}
