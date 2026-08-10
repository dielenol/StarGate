export type WorkerMode = "shadow" | "active";

export const WORKER_CONSUMER_NAMES = [
  "ameri-dm",
  "research-card",
  "shop-restock",
  "stock-market-wire",
] as const;

export type WorkerConsumerName = (typeof WORKER_CONSUMER_NAMES)[number];

export interface RealtimeTicketConfig {
  secret: string;
  issuer: string;
  audience: string;
  allowedOrigins: string[];
  maxPayloadBytes: number;
  maxConnections: number;
  maxConnectionsPerUser: number;
}

export interface WorkerConfig {
  mode: WorkerMode;
  replicaCount: 1;
  host: string;
  port: number;
  pollIntervalMs: number;
  enabledConsumers: WorkerConsumerName[];
  mongo: {
    uri: string;
    dbName: string;
    maxPoolSize: number;
  };
  realtime: RealtimeTicketConfig;
}

export type WorkerMongoConfig = WorkerConfig["mongo"];

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new WorkerConfigurationError(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

function integerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return defaultValue;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new WorkerConfigurationError(
      `${name}은(는) ${min} 이상 ${max} 이하 정수여야 합니다.`,
    );
  }
  return value;
}

export function loadWorkerMode(
  env: NodeJS.ProcessEnv = process.env,
): WorkerMode {
  const raw = env.WORKER_MODE;
  const mode = raw?.trim() || "shadow";
  if (mode !== "shadow" && mode !== "active") {
    throw new WorkerConfigurationError(
      "WORKER_MODE는 shadow 또는 active여야 합니다.",
    );
  }
  return mode;
}

export function loadWorkerMongoConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerMongoConfig {
  return {
    uri: required(env, "MONGODB_URI"),
    dbName: env.MONGODB_DB_NAME?.trim() || "stargate",
    maxPoolSize: integerInRange(
      env,
      "MONGODB_MAX_POOL_SIZE",
      10,
      1,
      50,
    ),
  };
}

function parseOrigins(raw: string): string[] {
  const values = [...new Set(raw.split(",").map((value) => value.trim()))]
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new WorkerConfigurationError(
          "REALTIME_ALLOWED_ORIGINS에는 http(s) origin만 사용할 수 있습니다.",
        );
      }
      if (url.origin !== value) {
        throw new WorkerConfigurationError(
          "REALTIME_ALLOWED_ORIGINS에는 path 없는 정확한 origin만 입력하세요.",
        );
      }
      return url.origin;
    });

  if (values.length === 0) {
    throw new WorkerConfigurationError(
      "REALTIME_ALLOWED_ORIGINS에 하나 이상의 origin이 필요합니다.",
    );
  }
  return values;
}

function parseConsumerNames(
  raw: string | undefined,
  options: { mode: WorkerMode; allowPartial: boolean },
): WorkerConsumerName[] {
  if (!raw?.trim()) {
    if (options.mode === "active") {
      throw new WorkerConfigurationError(
        "active worker에는 WORKER_CONSUMERS=all 설정이 필요합니다.",
      );
    }
    return [];
  }
  if (raw.trim().toLowerCase() === "all") {
    return [...WORKER_CONSUMER_NAMES];
  }
  const allowed = new Set<string>(WORKER_CONSUMER_NAMES);
  const values = [...new Set(raw.split(",").map((value) => value.trim()))]
    .filter(Boolean)
    .map((value) => {
      if (!allowed.has(value)) {
        throw new WorkerConfigurationError(
          `지원하지 않는 WORKER_CONSUMERS 값입니다: ${value}`,
        );
      }
      return value as WorkerConsumerName;
    });
  if (
    options.mode === "active" &&
    !options.allowPartial &&
    values.length !== WORKER_CONSUMER_NAMES.length
  ) {
    const configured = new Set(values);
    const missing = WORKER_CONSUMER_NAMES.filter(
      (name) => !configured.has(name),
    );
    throw new WorkerConfigurationError(
      `WORKER_CONSUMERS가 전체 domain consumer를 포함해야 합니다. 누락: ${missing.join(", ")}. 전체 활성화는 all을 사용하세요.`,
    );
  }
  return values;
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const mode = loadWorkerMode(env);
  const replicaCount = integerInRange(
    env,
    "WORKER_REPLICA_COUNT",
    1,
    1,
    1,
  ) as 1;
  const secret = required(env, "REALTIME_TICKET_SECRET");
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new WorkerConfigurationError(
      "REALTIME_TICKET_SECRET은 최소 32바이트여야 합니다.",
    );
  }

  return {
    mode,
    replicaCount,
    host: env.WORKER_HOST?.trim() || "0.0.0.0",
    port: integerInRange(env, "WORKER_PORT", 3001, 1, 65_535),
    pollIntervalMs: integerInRange(
      env,
      "WORKER_POLL_INTERVAL_MS",
      30_000,
      1_000,
      30_000,
    ),
    enabledConsumers: parseConsumerNames(env.WORKER_CONSUMERS, {
      mode,
      allowPartial:
        env.WORKER_CONSUMERS_ALLOW_PARTIAL?.trim().toLowerCase() ===
        "true",
    }),
    mongo: loadWorkerMongoConfig(env),
    realtime: {
      secret,
      issuer: env.REALTIME_TICKET_ISSUER?.trim() || "stargate-web",
      audience:
        env.REALTIME_TICKET_AUDIENCE?.trim() || "stargate-worker",
      allowedOrigins: parseOrigins(
        required(env, "REALTIME_ALLOWED_ORIGINS"),
      ),
      maxPayloadBytes: integerInRange(
        env,
        "REALTIME_MAX_PAYLOAD_BYTES",
        65_536,
        1_024,
        1_048_576,
      ),
      maxConnections: integerInRange(
        env,
        "REALTIME_MAX_CONNECTIONS",
        500,
        1,
        10_000,
      ),
      maxConnectionsPerUser: integerInRange(
        env,
        "REALTIME_MAX_CONNECTIONS_PER_USER",
        5,
        1,
        100,
      ),
    },
  };
}
