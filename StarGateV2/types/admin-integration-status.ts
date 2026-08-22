import type {
  IntegrationOutboxKind,
  ScheduledJobRunStatus,
} from "@stargate/shared-db";

export type AdminIntegrationHealth =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN";

export type AdminIntegrationErrorCategory =
  | "CONFIG"
  | "AUTH"
  | "RATE_LIMIT"
  | "NETWORK"
  | "PAYLOAD"
  | "LEASE"
  | "UNKNOWN";

export interface AdminWorkerRuntimeStatus {
  health: AdminIntegrationHealth;
  mode: "shadow" | "active" | null;
  lastSeenAt: string | null;
  enabledConsumers: string[];
  expectedConsumers: string[];
  missingConsumers: string[];
  enabledOutboxKinds: IntegrationOutboxKind[];
}

export interface AdminOutboxKindStatus {
  kind: IntegrationOutboxKind;
  channel: "감사" | "워크플로" | "편의점" | "주식" | "DM";
  health: AdminIntegrationHealth;
  dueCount: number;
  scheduledCount: number;
  processingCount: number;
  expiredLeaseCount: number;
  retryingCount: number;
  deadCount: number;
  maxAttempts: number;
  oldestDueAt: string | null;
  lastDeliveredAt: string | null;
  sentCount: number;
  skippedCount: number;
  unclassifiedCount: number;
  enabledByWorker: boolean | null;
}

export interface AdminDesiredStateStatus {
  key:
    | "RESEARCH"
    | "RESEARCH_RANKING"
    | "SHOP_RESTOCK"
    | "STOCK_MARKET_WIRE";
  label: string;
  health: AdminIntegrationHealth;
  documentCount: number;
  pendingCount: number;
  revisionLag: number;
  inFlightCount: number;
  errorCount: number;
  errorCategories: AdminIntegrationErrorCategory[];
  oldestPendingAt: string | null;
  updatedAt: string | null;
}

export interface AdminDelegatedWorkflowStatus {
  key: "AMERI_WORKSHOP_DM" | "REGISTRAR_BUREAUCRAT_VOTE";
  label: string;
  health: AdminIntegrationHealth;
  dueCount: number;
  scheduledCount: number;
  inFlightCount: number;
  errorCount: number;
}

export interface AdminScheduledJobStatus {
  jobName: string;
  health: AdminIntegrationHealth;
  status: ScheduledJobRunStatus | "UNKNOWN";
  attempts: number;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface AdminIntegrationStatusResponse {
  generatedAt: string;
  overallHealth: AdminIntegrationHealth;
  summary: {
    dueCount: number;
    scheduledCount: number;
    expiredLeaseCount: number;
    deadCount: number;
    desiredStateIssues: number;
    delegatedWorkflowIssues: number;
    sentCount: number;
    skippedCount: number;
    unclassifiedCount: number;
  };
  worker: AdminWorkerRuntimeStatus;
  outbox: AdminOutboxKindStatus[];
  desiredStates: AdminDesiredStateStatus[];
  delegatedWorkflows: AdminDelegatedWorkflowStatus[];
  scheduledJobs: AdminScheduledJobStatus[];
  legacy: {
    shopRestockDocuments: number;
  };
}
