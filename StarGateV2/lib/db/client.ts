/**
 * MongoDB 연결 관리 (Vercel 서버리스 최적화)
 *
 * global 캐싱으로 hot reload / 서버리스 cold start 시 커넥션 재사용.
 * 동일 클러스터의 stargate_erp DB와 registrar_bot DB 모두 접근 가능.
 */

import { MongoClient, type Db } from "mongodb";

const ERP_DB_NAME = process.env.ERP_DB_NAME ?? "stargate_erp";
const REGISTRAR_DB_NAME = process.env.REGISTRAR_DB_NAME ?? "registrar_bot";

interface MongoGlobal {
  _mongoClientPromise?: Promise<MongoClient>;
}

const g = globalThis as unknown as MongoGlobal;

function getClientPromise(): Promise<MongoClient> {
  if (g._mongoClientPromise) return g._mongoClientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
  }

  const client = new MongoClient(uri, { maxPoolSize: 5 });
  const promise = client.connect();
  g._mongoClientPromise = promise;
  return promise;
}

export async function getClient(): Promise<MongoClient> {
  return getClientPromise();
}

export async function getErpDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(ERP_DB_NAME);
}

export async function getRegistrarDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(REGISTRAR_DB_NAME);
}
