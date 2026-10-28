/**
 * 런타임 작업 실행 기록 (메모리)
 *
 * 알림 스케줄러 tick, 멤버 동기화, 음악 자동 점검, 생존 신호처럼 주기적으로 도는
 * 작업의 마지막 결과를 이름별로 보관한다. `/상태` 진단 명령이 읽으며, 프로세스를
 * 재시작하면 비어 있다(재시작 직후에는 "이력 없음"으로 표시).
 *
 * @module utils/runtime-status
 */

/** 작업 한 번의 실행 결과 */
export interface TaskRunInput {
  ok: boolean;
  /** 처리한 항목 수 (세션·멤버 등). 의미 없는 작업은 생략 */
  processed?: number;
  /** 실패 원인. 표시할 때 민감값을 제거한다 */
  error?: unknown;
  /** 판정 상태 등 짧은 부가 정보 (예: `degraded`) */
  detail?: string;
}

/** 이름별로 보관하는 마지막 실행 기록 */
export interface TaskRunRecord {
  /** 마지막 실행이 끝난 시각 (epoch ms) */
  lastRunAt: number;
  /** 마지막으로 성공한 시각 (epoch ms). 성공 이력이 없으면 null */
  lastOkAt: number | null;
  ok: boolean;
  processed: number | null;
  error: string | null;
  detail: string | null;
  /** 연속 실패 횟수. 성공하면 0 */
  consecutiveFailures: number;
}

const MAX_ERROR_LENGTH = 300;

const records = new Map<string, TaskRunRecord>();
const processStartedAt = Date.now();

function summarizeError(error: unknown): string | null {
  if (error === undefined || error === null) return null;
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length <= MAX_ERROR_LENGTH
    ? text
    : `${text.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}

/** 작업 실행 결과를 기록한다. */
export function recordTaskRun(
  name: string,
  result: TaskRunInput,
  now: number = Date.now(),
): void {
  const previous = records.get(name);
  records.set(name, {
    lastRunAt: now,
    lastOkAt: result.ok ? now : (previous?.lastOkAt ?? null),
    ok: result.ok,
    processed: result.processed ?? null,
    error: result.ok ? null : summarizeError(result.error),
    detail: result.detail ?? null,
    consecutiveFailures: result.ok ? 0 : (previous?.consecutiveFailures ?? 0) + 1,
  });
}

/** 이름으로 마지막 실행 기록을 조회한다. */
export function getTaskRun(name: string): TaskRunRecord | null {
  return records.get(name) ?? null;
}

/** 모든 작업의 마지막 실행 기록 (이름 오름차순). */
export function listTaskRuns(): Array<[string, TaskRunRecord]> {
  return [...records.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** 프로세스가 이 모듈을 처음 불러온 시각 (≈ 기동 시각, epoch ms). */
export function getProcessStartedAt(): number {
  return processStartedAt;
}
