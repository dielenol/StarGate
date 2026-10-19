import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

/* ── Config ── */

export interface SharedDbConfig {
  uri: string;
  /** @default "stargate" */
  dbName?: string;
  /** @default serverless: 5, long-running: 10 */
  maxPoolSize?: number;
  /**
   * 서버 선택(사용 가능한 서버 탐색) 대기 상한(ms).
   * 생략 시 URI 쿼리 값 → 드라이버 기본값 30000. 지정 시 URI 쿼리보다 우선한다.
   */
  serverSelectionTimeoutMS?: number;
  /**
   * 소켓 연결(TCP·TLS·핸드셰이크) 대기 상한(ms). 서버 모니터 heartbeat 소켓 타임아웃으로도 쓰여
   * (poll: 이 값, streaming: 이 값 + heartbeatFrequencyMS) 초과 시 드라이버가 진행 중인 쿼리까지 끊는다.
   * 생략 시 URI 쿼리 값 → 드라이버 기본값 30000. 지정 시 URI 쿼리보다 우선한다.
   */
  connectTimeoutMS?: number;
}

/**
 * 두 모드가 공유하는 MongoClient 옵션 구성.
 * 생략된 타임아웃은 undefined 로 넘긴다 — 드라이버가 걸러내고 URI 쿼리/기본값을 쓴다.
 */
function clientOptions(
  config: SharedDbConfig,
  defaultMaxPoolSize: number,
): MongoClientOptions {
  return {
    maxPoolSize: config.maxPoolSize ?? defaultMaxPoolSize,
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
    connectTimeoutMS: config.connectTimeoutMS,
  };
}

/* ── Internal state ── */

const DEFAULT_DB_NAME = "stargate";

interface MongoGlobal {
  __sharedDbClientPromise?: Promise<MongoClient>;
}

type ConnectionMode = "serverless" | "long-running" | null;

let mode: ConnectionMode = null;
let dbName: string = DEFAULT_DB_NAME;
let serverlessConfig: SharedDbConfig | null = null;

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
  serverlessConfig = config;
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

  const client = new MongoClient(config.uri, clientOptions(config, 10));

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
      if (!serverlessConfig) {
        throw new Error(
          "[shared-db] Serverless mode: initServerless() must be called first.",
        );
      }
      const client = new MongoClient(
        serverlessConfig.uri,
        clientOptions(serverlessConfig, 5),
      );
      g.__sharedDbClientPromise = client.connect().catch(async (err) => {
        delete g.__sharedDbClientPromise;
        await client.close().catch(() => {});
        throw err;
      });
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
