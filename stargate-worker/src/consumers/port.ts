import type { WorkerMode } from "../config.js";

export interface ConsumerTickResult {
  observedDue: number;
  claimed?: number;
  delivered?: number;
  failed?: number;
  dead?: number;
  /** 직전 장애가 실제로 사라졌음을 확인한 poll. */
  operationalRecovery?: boolean;
  operationalAlert?: {
    fingerprint: string;
    severity: "WARNING" | "CRITICAL";
    summary: string;
  };
}

/**
 * 각 도메인의 claim/delivery 구현을 worker loop와 분리하는 경계다.
 * active adapter는 @stargate/shared-db의 lease CRUD를 사용해야 한다.
 */
export interface DueWorkConsumerPort {
  readonly name: string;
  tick(context: {
    mode: WorkerMode;
    signal: AbortSignal;
  }): Promise<ConsumerTickResult>;
}
