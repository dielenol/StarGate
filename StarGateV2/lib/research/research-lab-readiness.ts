const WORKER_HEARTBEAT_MAX_AGE_MS = 90_000;
const WORKER_HEARTBEAT_FUTURE_SKEW_MS = 5_000;

export function isResearchLabMutationConfigured(
  value: string | undefined = process.env.RESEARCH_LAB_MUTATIONS_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

export interface ResearchLabWorkerRuntimeStatus {
  _id: "active";
  ready?: boolean;
  activeMutationConsumers?: string[];
  enabledOutboxKinds?: string[];
  lastSeenAt?: Date;
}

export function isResearchLabWorkerRuntimeStatusReady(
  status: ResearchLabWorkerRuntimeStatus | null,
  now: Date = new Date(),
): boolean {
  return Boolean(
    status?.ready === true &&
      status.activeMutationConsumers?.includes("research-lab") &&
      status.enabledOutboxKinds?.includes("RESEARCH_LAB_DM") &&
      status.lastSeenAt instanceof Date &&
      now.getTime() - status.lastSeenAt.getTime() >=
        -WORKER_HEARTBEAT_FUTURE_SKEW_MS &&
      now.getTime() - status.lastSeenAt.getTime() <=
        WORKER_HEARTBEAT_MAX_AGE_MS,
  );
}
