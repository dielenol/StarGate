import type {
  ScheduledJobExecutionContext,
  ScheduledJobExecutionResult,
  ScheduledJobName,
} from "@stargate/core";

export type ScheduledJobSummary = Record<
  string,
  number | string | boolean | null
>;

export interface ScheduledJobHandlerContext
  extends ScheduledJobExecutionContext {
  /**
   * lease 갱신 실패나 worker 종료 시 중단된다.
   * handler는 장기 반복 구간에서 signal을 확인해야 한다.
   */
  signal: AbortSignal;
}

export interface ScheduledJobHandler {
  readonly jobName: ScheduledJobName;
  execute(
    context: ScheduledJobHandlerContext,
  ): Promise<ScheduledJobSummary>;
}

/**
 * scheduled_job_runs의 unique slot/lease를 소유할 persistence 경계.
 * 구현체는 @stargate/shared-db의 claim/complete/fail CRUD를 사용한다.
 */
export interface ScheduledJobCoordinatorPort {
  executeOnce(
    context: ScheduledJobExecutionContext,
  ): Promise<ScheduledJobExecutionResult>;
}
