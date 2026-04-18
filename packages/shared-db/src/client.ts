import { MongoClient, type Db } from "mongodb";

/* ── Config ── */

export interface SharedDbConfig {
  uri: string;
  /** @default "stargate" */
  dbName?: string;
  /** @default serverless: 5, long-running: 10 */
  maxPoolSize?: number;
}

/* ── Internal state ── */

const DEFAULT_DB_NAME = "stargate";

interface MongoGlobal {
  __sharedDbClientPromise?: Promise<MongoClient>;
}

type ConnectionMode = "serverless" | "long-running" | null;

let mode: ConnectionMode = null;
let dbName: string = DEFAULT_DB_NAME;

// Long-running mode state
let longRunningClient: MongoClient | null = null;
let longRunningConnectPromise: Promise<void> | null = null;

/* ── Serverless mode ── */

/**
 * Serverless 환경 초기화.
 * globalThis에 MongoClient promise를 캐싱한다 (Vercel/Next.js 패턴).
 */
export function initServerless(config: SharedDbConfig): void {
  if (mode === "long-running") {
    throw new Error(
      "[shared-db] Already initialized in long-running mode. Cannot switch to serverless.",
    );
  }

  mode = "serverless";
  dbName = config.dbName ?? DEFAULT_DB_NAME;

  const g = globalThis as unknown as MongoGlobal;
  if (!g.__sharedDbClientPromise) {
    const client = new MongoClient(config.uri, {
      maxPoolSize: config.maxPoolSize ?? 5,
    });
    g.__sharedDbClientPromise = client.connect();
  }
}

/* ── Long-running mode ── */

/**
 * Long-running 프로세스(Discord bot 등) 연결.
 * 명시적 connect/close 라이프사이클.
 */
export async function connect(config: SharedDbConfig): Promise<void> {
  if (mode === "serverless") {
    throw new Error(
      "[shared-db] Already initialized in serverless mode. Cannot switch to long-running.",
    );
  }

  if (longRunningClient) return;
  if (longRunningConnectPromise) return longRunningConnectPromise;

  mode = "long-running";
  dbName = config.dbName ?? DEFAULT_DB_NAME;

  const client = new MongoClient(config.uri, {
    maxPoolSize: config.maxPoolSize ?? 10,
  });

  longRunningConnectPromise = (async () => {
    try {
      await client.connect();
      longRunningClient = client;
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    } finally {
      longRunningConnectPromise = null;
    }
  })();

  return longRunningConnectPromise;
}

/**
 * Long-running 프로세스 연결 종료.
 */
export async function close(): Promise<void> {
  if (longRunningClient) {
    await longRunningClient.close();
    longRunningClient = null;
    mode = null;
  }
}

/* ── Async accessors (both modes) ── */

/**
 * MongoClient를 비동기로 반환한다.
 * Serverless/long-running 모두 사용 가능.
 */
export async function getClient(): Promise<MongoClient> {
  if (mode === "serverless") {
    const g = globalThis as unknown as MongoGlobal;
    if (!g.__sharedDbClientPromise) {
      throw new Error(
        "[shared-db] Serverless mode: initServerless() must be called first.",
      );
    }
    return g.__sharedDbClientPromise;
  }

  if (mode === "long-running") {
    if (longRunningConnectPromise) {
      await longRunningConnectPromise;
    }
    if (!longRunningClient) {
      throw new Error(
        "[shared-db] Long-running mode: connect() must be called first.",
      );
    }
    return longRunningClient;
  }

  throw new Error(
    "[shared-db] Not initialized. Call initServerless() or connect() first.",
  );
}

/**
 * Db 인스턴스를 비동기로 반환한다.
 */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbName);
}

/* ── Sync accessors (long-running only) ── */

/**
 * MongoClient를 동기적으로 반환한다.
 * Long-running 모드에서만 사용 가능. 연결 전이면 throw.
 */
export function getClientSync(): MongoClient {
  if (mode !== "long-running") {
    throw new Error(
      "[shared-db] getClientSync() is only available in long-running mode.",
    );
  }
  if (!longRunningClient) {
    throw new Error(
      "[shared-db] Not connected. Call connect() and await it first.",
    );
  }
  return longRunningClient;
}

/**
 * Db 인스턴스를 동기적으로 반환한다.
 * Long-running 모드에서만 사용 가능.
 */
export function getDbSync(): Db {
  return getClientSync().db(dbName);
}
