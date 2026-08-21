export type VttRuntimeState =
  | "RUNNING"
  | "STOPPED"
  | "STARTING"
  | "STOPPING"
  | "DEGRADED"
  | "UNREACHABLE";

export type VttRuntimeDesiredState = "RUNNING" | "STOPPED" | null;
export type VttRuntimeAction = "START" | "STOP";

export interface VttRuntimeLastAction {
  requestId: string;
  action: VttRuntimeAction;
  force: boolean;
  actor: { id: string; displayName: string } | null;
  requestedAt: number;
  completedAt: number;
  result: string;
}

export interface VttRuntimeStatus {
  state: VttRuntimeState;
  desiredState: VttRuntimeDesiredState;
  connectedUsers: number | null;
  startedAt: number | null;
  sourceRevision: string | null;
  lastAction: VttRuntimeLastAction | null;
  controlEnabled: boolean;
  unavailableReason?:
    | "CONTROL_DISABLED"
    | "CONTROL_MISCONFIGURED"
    | "CONTROLLER_REJECTED"
    | "CONTROLLER_UNREACHABLE"
    | "INVALID_CONTROLLER_RESPONSE";
}

export interface VttRuntimeActionInput {
  action: VttRuntimeAction;
  force?: boolean;
}

export interface VttRuntimeActionSuccess {
  ok: true;
  requestId: string;
  result: string;
  previousState: VttRuntimeState;
  status: VttRuntimeStatus;
  replayed?: boolean;
  auditRecorded: boolean;
  warning?: string;
}

export interface VttRuntimeActionFailure {
  ok: false;
  requestId?: string;
  code: string;
  error: string;
  connectedUsers?: number;
}

export type VttRuntimeActionResponse =
  | VttRuntimeActionSuccess
  | VttRuntimeActionFailure;
