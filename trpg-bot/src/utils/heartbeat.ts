/**
 * 프로세스 생존 신호
 *
 * 주기적으로 Discord 게이트웨이(모든 shard Ready)를 확인하고, 정상일 때만 생존
 * 신호 파일의 mtime 을 갱신한다. Docker HEALTHCHECK 는 이 파일의 나이를 보고
 * "프로세스는 살아 있지만 게이트웨이가 끊긴" 상태를 unhealthy 로 판정한다.
 * push URL 이 있으면 같은 시점에 외부 감시(Uptime Kuma Push 등)로 GET 을 보낸다.
 *
 * MongoDB ping 은 함께 재지만 생존 판정에는 넣지 않는다 — 재시작으로 DB 장애를
 * 고칠 수 없고, DB 가 필요 없는 음악·주사위까지 끊기기 때문이다. DB 실패는
 * `/상태` 기록의 detail 과 반환값에만 남긴다.
 *
 * 게이트웨이 판정은 `client.ws.status` 가 아니라 shard 상태로 한다. discord.js 14.26
 * 의 `WebSocketManager.status` 는 최초 Ready 뒤 바뀌지 않고, 재연결·끊김은
 * `WebSocketShard.status` 에만 반영된다.
 *
 * 봇이 완전히 멈추면 스스로 알릴 수 없으므로, 파일·push 가 끊기는 것 자체가 신호다.
 *
 * @module utils/heartbeat
 */

import { writeFile } from "node:fs/promises";

import { Status } from "discord.js";

import { recordTaskRun } from "./runtime-status.js";

const DEFAULT_INTERVAL_MS = 60_000;
const DB_PING_TIMEOUT_MS = 5_000;
const PUSH_TIMEOUT_MS = 5_000;

export interface HeartbeatOptions {
  /** 게이트웨이 shard 상태만 읽는다 (`client.ws.shards`) — Map 과 Collection 모두 허용 */
  client: {
    ws: { shards: { size: number; values(): Iterable<{ status: Status }> } };
  };
  filePath: string;
  pushUrl?: string;
  pingDb: () => Promise<void>;
  intervalMs?: number;
  /** 테스트 주입용 */
  writeBeat?: (path: string, content: string) => Promise<void>;
  fetchImpl?: (url: string, init: { signal: AbortSignal }) => Promise<unknown>;
  now?: () => number;
  logWarn?: (message: string) => void;
}

export type HeartbeatResult =
  | { ok: true; dbOk: true }
  | { ok: true; dbOk: false; dbError: unknown }
  | { ok: false; reason: "gateway" | "write"; error?: unknown };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} ${ms}ms 초과`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** shard 가 하나 이상 있고 전부 Ready 인지. 아니면 상태 요약 문자열을 돌려준다. */
function gatewayNotReadyReason(
  shards: HeartbeatOptions["client"]["ws"]["shards"],
): string | null {
  if (shards.size === 0) return "shards=0";
  const statuses = [...shards.values()].map((shard) => shard.status);
  return statuses.every((status) => status === Status.Ready)
    ? null
    : `shard status=${statuses.map((status) => Status[status] ?? status).join(",")}`;
}

/** 생존 신호를 한 번 판정·기록한다. 파일 갱신은 게이트웨이(모든 shard Ready)가 정상일 때만. */
export async function runHeartbeatOnce(
  options: HeartbeatOptions,
): Promise<HeartbeatResult> {
  const now = options.now ?? Date.now;
  const logWarn = options.logWarn ?? ((message) => console.warn(message));

  const gatewayReason = gatewayNotReadyReason(options.client.ws.shards);
  if (gatewayReason) {
    recordTaskRun("heartbeat", { ok: false, error: `gateway ${gatewayReason}` });
    return { ok: false, reason: "gateway" };
  }

  // DB 는 판정 조건이 아니다 — 실패해도 파일 갱신·push 는 계속한다.
  let dbError: unknown;
  let dbFailed = false;
  try {
    await withTimeout(options.pingDb(), DB_PING_TIMEOUT_MS, "DB ping");
  } catch (error) {
    dbFailed = true;
    dbError = error;
  }

  const writeBeat =
    options.writeBeat ??
    ((path: string, content: string) => writeFile(path, content, "utf8"));
  try {
    await writeBeat(options.filePath, String(now()));
  } catch (error) {
    recordTaskRun("heartbeat", { ok: false, error });
    return { ok: false, reason: "write", error };
  }

  if (options.pushUrl) {
    const fetchImpl =
      options.fetchImpl ??
      ((url: string, init: { signal: AbortSignal }) => fetch(url, init));
    try {
      await fetchImpl(options.pushUrl, {
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
    } catch (error) {
      // 외부 감시 전송 실패는 봇 상태와 무관하다. URL 은 비밀값일 수 있어 남기지 않는다.
      logWarn(
        `[heartbeat] 외부 생존 신호 전송 실패: ${error instanceof Error ? error.name : "unknown"}`,
      );
    }
  }

  if (dbFailed) {
    const name = dbError instanceof Error ? dbError.name : "unknown";
    recordTaskRun("heartbeat", { ok: true, detail: `db:${name}` });
    return { ok: true, dbOk: false, dbError };
  }
  recordTaskRun("heartbeat", { ok: true });
  return { ok: true, dbOk: true };
}

/**
 * 생존 신호를 즉시 한 번 보내고 이후 주기적으로 반복한다.
 *
 * @returns 정리 함수 — shutdown 에서 호출
 */
export function startHeartbeat(options: HeartbeatOptions): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  let inFlight = false;

  const beat = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runHeartbeatOnce(options);
    } catch (error) {
      console.error("[heartbeat] 생존 신호 처리 실패:", error);
    } finally {
      inFlight = false;
    }
  };

  void beat();
  const handle = setInterval(() => {
    void beat();
  }, intervalMs);
  handle.unref();

  return () => clearInterval(handle);
}
