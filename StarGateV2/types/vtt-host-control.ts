import type { VttRuntimeState } from "@/types/vtt-runtime";

export type VttHostTarget = "HOME" | "VPS" | "OFFLINE";
export type VttObservedHost = VttHostTarget | "UNKNOWN";
export type VttHostAction = "SELECT_ROUTE" | "SYNC_DATA";

export type VttHostControlState =
  | "RUNNING"
  | "OFFLINE"
  | "SWITCHING"
  | "DEGRADED"
  | "RECOVERY_REQUIRED"
  | "UNREACHABLE";

export type VttHostTransitionPhase =
  | "CLOSING_PUBLIC"
  | "STOPPING_SOURCE"
  | "LOCKING_DATA"
  | "SNAPSHOTTING_SOURCE"
  | "TRANSFERRING"
  | "VERIFYING_TARGET"
  | "RELEASING_DATA_LOCKS"
  | "STARTING_TARGET"
  | "ROUTING_TARGET"
  | "VERIFYING_PUBLIC"
  | "RECOVERY_REQUIRED";

export interface VttStateManifest {
  digest: string;
  fileCount: number;
  totalBytes: number;
}

export interface VttHostRuntimeStatus {
  state: VttRuntimeState;
  reachable: boolean;
  connectedUsers: number | null;
  startedAt: number | null;
  sourceRevision: string | null;
}

export interface VttHostTransition {
  requestId: string;
  action: VttHostAction;
  sourceHost: VttObservedHost;
  targetHost: VttHostTarget;
  phase: VttHostTransitionPhase;
  force: boolean;
  actor: { id: string; displayName: string } | null;
  startedAt: number;
  updatedAt: number;
  error: { code: string; message: string } | null;
}

export interface VttHostLastAction {
  requestId: string;
  action: VttHostAction;
  sourceHost: VttObservedHost;
  targetHost: VttHostTarget;
  force: boolean;
  actor: { id: string; displayName: string } | null;
  requestedAt: number;
  completedAt: number;
  result: string;
  generation: number | null;
  sourceRevision: string | null;
  code: string | null;
}

export interface VttHostLastSync {
  requestId: string;
  sourceHost: Exclude<VttHostTarget, "OFFLINE">;
  targetHost: Exclude<VttHostTarget, "OFFLINE">;
  generation: number;
  manifest: VttStateManifest;
  completedAt: number;
}

export interface VttHostStatus {
  state: VttHostControlState;
  activeHost: VttObservedHost;
  desiredHost: VttHostTarget | null;
  lastWriterHost: Exclude<VttHostTarget, "OFFLINE"> | null;
  generation: number | null;
  manifest: VttStateManifest | null;
  lastSync: VttHostLastSync | null;
  expectedSourceRevision: string | null;
  routeHost: VttObservedHost;
  transition: VttHostTransition | null;
  hosts: {
    HOME: VttHostRuntimeStatus;
    VPS: VttHostRuntimeStatus;
  };
  lastAction: VttHostLastAction | null;
  completedActions: VttHostLastAction[];
  pendingAuditCount: number;
  auditBacklogBlocked: boolean;
  controlEnabled: boolean;
  unavailableReason?:
    | "CONTROL_DISABLED"
    | "CONTROL_MISCONFIGURED"
    | "CONTROLLER_REJECTED"
    | "CONTROLLER_UNREACHABLE"
    | "INVALID_CONTROLLER_RESPONSE";
}

export interface VttHostRouteActionInput {
  action: "SELECT_ROUTE";
  targetHost: VttHostTarget;
}

export interface VttHostSyncActionInput {
  action: "SYNC_DATA";
  sourceHost: Exclude<VttHostTarget, "OFFLINE">;
  targetHost: Exclude<VttHostTarget, "OFFLINE">;
}

export type VttHostActionInput =
  | VttHostRouteActionInput
  | VttHostSyncActionInput;

export interface VttHostActionSuccess {
  ok: true;
  accepted: boolean;
  requestId: string;
  requestedAt: number;
  result: string;
  status: VttHostStatus;
  replayed?: boolean;
  auditRecorded: boolean;
  warning?: string;
}

export interface VttHostActionFailure {
  ok: false;
  requestId?: string;
  code: string;
  error: string;
  connectedUsers?: number;
}

export type VttHostActionResponse =
  | VttHostActionSuccess
  | VttHostActionFailure;
