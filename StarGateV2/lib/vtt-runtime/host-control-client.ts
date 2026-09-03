import "server-only";

import type {
  VttHostActionFailure,
  VttHostAction,
  VttHostActionInput,
  VttHostActionResponse,
  VttHostActionSuccess,
  VttHostControlState,
  VttHostLastAction,
  VttHostLastSync,
  VttHostRuntimeStatus,
  VttHostStatus,
  VttHostTarget,
  VttHostTransition,
  VttHostTransitionPhase,
  VttObservedHost,
  VttStateManifest,
} from "@/types/vtt-host-control";
import type { VttRuntimeState } from "@/types/vtt-runtime";

import {
  createVttControlNonce,
  signVttControlRequest,
} from "@/lib/vtt-runtime/signature";

const STATUS_PATH = "/v2/status";
const ACTIONS_PATH = "/v2/actions";
const AUDIT_ACKS_PATH = "/v2/audit-acks";
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_COMPLETED_ACTIONS = 100;
const MAX_AUDIT_ACK_IDS = 40;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;
const VALID_CONTROL_STATES = new Set<VttHostControlState>([
  "RUNNING",
  "OFFLINE",
  "SWITCHING",
  "DEGRADED",
  "RECOVERY_REQUIRED",
]);
const VALID_RUNTIME_STATES = new Set<VttRuntimeState>([
  "RUNNING",
  "STOPPED",
  "STARTING",
  "STOPPING",
  "DEGRADED",
  "UNREACHABLE",
]);
const VALID_OBSERVED_HOSTS = new Set<VttObservedHost>([
  "HOME",
  "VPS",
  "OFFLINE",
  "UNKNOWN",
]);
const VALID_TARGET_HOSTS = new Set<VttHostTarget>([
  "HOME",
  "VPS",
  "OFFLINE",
]);
const VALID_ACTION_RESULTS = new Set([
  "ACTION_ACCEPTED",
  "ROUTE_SELECTED",
  "ALREADY_SELECTED",
  "DATA_SYNCED",
  "ROUTE_FAILED",
  "SYNC_FAILED",
  "SWITCHED",
  "ALREADY_ACTIVE",
  "RECOVERY_REQUIRED",
]);
const VALID_ACTIONS = new Set<VttHostAction>([
  "SELECT_ROUTE",
  "SYNC_DATA",
]);
const VALID_TRANSITION_PHASES = new Set<VttHostTransitionPhase>([
  "CLOSING_PUBLIC",
  "STOPPING_SOURCE",
  "LOCKING_DATA",
  "SNAPSHOTTING_SOURCE",
  "TRANSFERRING",
  "VERIFYING_TARGET",
  "RELEASING_DATA_LOCKS",
  "STARTING_TARGET",
  "ROUTING_TARGET",
  "VERIFYING_PUBLIC",
  "RECOVERY_REQUIRED",
]);

interface HostControlConfiguration {
  enabled: boolean;
  url: URL | null;
  hmacSecret: string;
  cfAccessClientId: string;
  cfAccessClientSecret: string;
  unavailableReason?: VttHostStatus["unavailableReason"];
}

interface ControllerRequestOptions {
  method: "GET" | "POST";
  pathname: typeof STATUS_PATH | typeof ACTIONS_PATH | typeof AUDIT_ACKS_PATH;
  body?: string;
  timeoutMs: number;
}

interface ControllerResponse {
  status: number;
  ok: boolean;
  payload: unknown;
}

export type VttHostControllerActionInput = VttHostActionInput & {
  requestId: string;
  actor: { id: string; displayName: string };
};

export interface VttHostControllerActionResult {
  status: number;
  body: VttHostActionResponse;
}

class ControllerTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControllerTransportError";
  }
}

function unreachableRuntime(): VttHostRuntimeStatus {
  return {
    state: "UNREACHABLE",
    reachable: false,
    connectedUsers: null,
    startedAt: null,
    sourceRevision: null,
  };
}

function unavailableStatus(
  reason: NonNullable<VttHostStatus["unavailableReason"]>,
  controlEnabled: boolean,
): VttHostStatus {
  return {
    state: "UNREACHABLE",
    activeHost: "UNKNOWN",
    desiredHost: null,
    lastWriterHost: null,
    generation: null,
    manifest: null,
    lastSync: null,
    expectedSourceRevision: null,
    routeHost: "UNKNOWN",
    transition: null,
    hosts: {
      HOME: unreachableRuntime(),
      VPS: unreachableRuntime(),
    },
    lastAction: null,
    completedActions: [],
    pendingAuditCount: 0,
    auditBacklogBlocked: false,
    controlEnabled,
    unavailableReason: reason,
  };
}

export function isVttHostControlModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.NOCHICHIM_HOST_CONTROL_ENABLED === "true" &&
    env.VERCEL_ENV === "production"
  );
}

function readControlConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): HostControlConfiguration {
  if (!isVttHostControlModeEnabled(env)) {
    return {
      enabled: false,
      url: null,
      hmacSecret: "",
      cfAccessClientId: "",
      cfAccessClientSecret: "",
      unavailableReason: "CONTROL_DISABLED",
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(env.NOCHICHIM_HOST_CONTROL_URL ?? "");
  } catch {
    // 아래 공통 구성 검증에서 fail closed 한다.
  }
  const hmacSecret = env.NOCHICHIM_HOST_CONTROL_HMAC_SECRET ?? "";
  const cfAccessClientId = env.NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_ID ?? "";
  const cfAccessClientSecret = env.NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_SECRET ?? "";
  const validUrl =
    url?.protocol === "https:" &&
    url.origin === "https://control.nochiijjim.com" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";

  if (
    !validUrl ||
    Buffer.byteLength(hmacSecret, "utf8") < 32 ||
    !cfAccessClientId ||
    !cfAccessClientSecret
  ) {
    return {
      enabled: false,
      url: null,
      hmacSecret: "",
      cfAccessClientId: "",
      cfAccessClientSecret: "",
      unavailableReason: "CONTROL_MISCONFIGURED",
    };
  }

  return {
    enabled: true,
    url,
    hmacSecret,
    cfAccessClientId,
    cfAccessClientSecret,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function parseActor(
  value: unknown,
): { id: string; displayName: string } | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.displayName !== "string") {
    return null;
  }
  const id = value.id.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 128);
  const displayName = value.displayName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 100);
  return id && displayName ? { id, displayName } : null;
}

function parseSourceRevision(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const revision = value.slice(0, 128);
  return /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,127}$/.test(revision)
    ? revision
    : undefined;
}

function parseExactSourceRevision(value: unknown): string | null | undefined {
  const revision = parseSourceRevision(value);
  if (revision === null || revision === undefined) return revision;
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(revision)
    ? revision.toLowerCase()
    : undefined;
}

function parseManifest(value: unknown): VttStateManifest | null {
  if (!isRecord(value)) return null;
  const fileCount = parseNonNegativeInteger(value.fileCount);
  const totalBytes = parseNonNegativeInteger(value.totalBytes);
  if (
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    fileCount === null ||
    totalBytes === null
  ) {
    return null;
  }
  return { digest: value.digest, fileCount, totalBytes };
}

function parseRuntimeStatus(value: unknown): VttHostRuntimeStatus | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.state !== "string" ||
    !VALID_RUNTIME_STATES.has(value.state as VttRuntimeState) ||
    typeof value.reachable !== "boolean"
  ) {
    return null;
  }
  const state = value.state as VttRuntimeState;
  if (value.reachable !== (state !== "UNREACHABLE")) return null;
  const connectedUsers = value.connectedUsers === null
    ? null
    : parseNonNegativeInteger(value.connectedUsers);
  if (value.connectedUsers !== null && connectedUsers === null) return null;
  const startedAt = value.startedAt === null ? null : parseTimestamp(value.startedAt);
  if (value.startedAt !== null && startedAt === null) return null;
  const sourceRevision = parseSourceRevision(value.sourceRevision);
  if (sourceRevision === undefined) return null;
  return {
    state,
    reachable: value.reachable,
    connectedUsers,
    startedAt,
    sourceRevision,
  };
}

function parseTransitionError(
  value: unknown,
): VttHostTransition["error"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (typeof value.code !== "string" || typeof value.message !== "string") {
    return undefined;
  }
  return {
    code: value.code.slice(0, 64),
    message: value.message.slice(0, 300),
  };
}

function parseTransition(value: unknown): VttHostTransition | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const startedAt = parseTimestamp(value.startedAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  const error = parseTransitionError(value.error);
  const action = value.action === undefined || value.action === "SWITCH_HOST"
    ? "SELECT_ROUTE"
    : value.action;
  if (
    typeof value.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(value.requestId) ||
    typeof action !== "string" ||
    !VALID_ACTIONS.has(action as VttHostAction) ||
    typeof value.sourceHost !== "string" ||
    !VALID_OBSERVED_HOSTS.has(value.sourceHost as VttObservedHost) ||
    typeof value.targetHost !== "string" ||
    !VALID_TARGET_HOSTS.has(value.targetHost as VttHostTarget) ||
    typeof value.phase !== "string" ||
    !VALID_TRANSITION_PHASES.has(value.phase as VttHostTransitionPhase) ||
    typeof value.force !== "boolean" ||
    startedAt === null ||
    updatedAt === null ||
    error === undefined
  ) {
    return undefined;
  }
  return {
    requestId: value.requestId.slice(0, 128),
    action: action as VttHostAction,
    sourceHost: value.sourceHost as VttObservedHost,
    targetHost: value.targetHost as VttHostTarget,
    phase: value.phase as VttHostTransitionPhase,
    force: value.force,
    actor: parseActor(value.actor),
    startedAt,
    updatedAt,
    error,
  };
}

function parseLastAction(value: unknown): VttHostLastAction | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const requestedAt = parseTimestamp(value.requestedAt);
  const completedAt = parseTimestamp(value.completedAt);
  const generation = value.generation === null || value.generation === undefined
    ? null
    : parseNonNegativeInteger(value.generation);
  const action = value.action === "SWITCH_HOST" ? "SELECT_ROUTE" : value.action;
  if (
    typeof value.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(value.requestId) ||
    typeof action !== "string" ||
    !VALID_ACTIONS.has(action as VttHostAction) ||
    typeof value.sourceHost !== "string" ||
    !VALID_OBSERVED_HOSTS.has(value.sourceHost as VttObservedHost) ||
    typeof value.targetHost !== "string" ||
    !VALID_TARGET_HOSTS.has(value.targetHost as VttHostTarget) ||
    typeof value.force !== "boolean" ||
    requestedAt === null ||
    completedAt === null ||
    typeof value.result !== "string" ||
    !VALID_ACTION_RESULTS.has(value.result) ||
    (value.generation !== null && value.generation !== undefined && generation === null)
  ) {
    return undefined;
  }
  const sourceRevision = value.sourceRevision === undefined
    ? null
    : parseSourceRevision(value.sourceRevision);
  if (sourceRevision === undefined) return undefined;
  if (
    value.code !== undefined &&
    value.code !== null &&
    (
      typeof value.code !== "string" ||
      !/^[A-Z0-9_-]{1,64}$/.test(value.code)
    )
  ) {
    return undefined;
  }
  return {
    requestId: value.requestId.slice(0, 128),
    action: action as VttHostAction,
    sourceHost: value.sourceHost as VttObservedHost,
    targetHost: value.targetHost as VttHostTarget,
    force: value.force,
    actor: parseActor(value.actor),
    requestedAt,
    completedAt,
    result: value.result,
    generation,
    sourceRevision,
    code: typeof value.code === "string" ? value.code.slice(0, 64) : null,
  };
}

function parseLastSync(value: unknown): VttHostLastSync | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const generation = parseNonNegativeInteger(value.generation);
  const manifest = parseManifest(value.manifest);
  const completedAt = parseTimestamp(value.completedAt);
  if (
    typeof value.requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(value.requestId) ||
    (value.sourceHost !== "HOME" && value.sourceHost !== "VPS") ||
    (value.targetHost !== "HOME" && value.targetHost !== "VPS") ||
    value.sourceHost === value.targetHost ||
    generation === null ||
    !manifest ||
    completedAt === null
  ) {
    return null;
  }
  return {
    requestId: value.requestId.slice(0, 128),
    sourceHost: value.sourceHost,
    targetHost: value.targetHost,
    generation,
    manifest,
    completedAt,
  };
}

function parseHostStatus(value: unknown): VttHostStatus | null {
  if (!isRecord(value) || !isRecord(value.hosts)) return null;
  if (
    typeof value.state !== "string" ||
    !VALID_CONTROL_STATES.has(value.state as VttHostControlState) ||
    typeof value.activeHost !== "string" ||
    !VALID_OBSERVED_HOSTS.has(value.activeHost as VttObservedHost) ||
    (value.desiredHost !== null && (
      typeof value.desiredHost !== "string" ||
      !VALID_TARGET_HOSTS.has(value.desiredHost as VttHostTarget)
    )) ||
    (value.lastWriterHost !== null &&
      value.lastWriterHost !== "HOME" &&
      value.lastWriterHost !== "VPS") ||
    typeof value.routeHost !== "string" ||
    !VALID_OBSERVED_HOSTS.has(value.routeHost as VttObservedHost)
  ) {
    return null;
  }
  const generation = parseNonNegativeInteger(value.generation);
  const manifest = value.manifest === null ? null : parseManifest(value.manifest);
  const lastSync = value.lastSync === undefined ? null : parseLastSync(value.lastSync);
  const expectedSourceRevision = value.expectedSourceRevision === undefined
    ? null
    : parseExactSourceRevision(value.expectedSourceRevision);
  const transition = parseTransition(value.transition);
  const home = parseRuntimeStatus(value.hosts.HOME);
  const vps = parseRuntimeStatus(value.hosts.VPS);
  const lastAction = parseLastAction(value.lastAction);
  const completedActions = (
    Array.isArray(value.completedActions) &&
    value.completedActions.length <= MAX_COMPLETED_ACTIONS
  )
    ? value.completedActions.map(parseLastAction)
    : null;
  const pendingAuditCount = parseNonNegativeInteger(value.pendingAuditCount);
  const auditBacklogBlocked = typeof value.auditBacklogBlocked === "boolean"
    ? value.auditBacklogBlocked
    : null;
  if (
    generation === null ||
    (value.manifest !== null && manifest === null) ||
    (value.lastSync !== undefined && value.lastSync !== null && lastSync === null) ||
    expectedSourceRevision === undefined ||
    transition === undefined ||
    !home ||
    !vps ||
    lastAction === undefined ||
    completedActions === null ||
    completedActions.some(action => action === undefined || action === null) ||
    pendingAuditCount === null ||
    completedActions.length !== Math.min(pendingAuditCount, MAX_COMPLETED_ACTIONS) ||
    auditBacklogBlocked === null ||
    auditBacklogBlocked !== (pendingAuditCount >= MAX_COMPLETED_ACTIONS)
  ) {
    return null;
  }
  return {
    state: value.state as VttHostControlState,
    activeHost: value.activeHost as VttObservedHost,
    desiredHost: value.desiredHost as VttHostTarget | null,
    lastWriterHost: value.lastWriterHost as "HOME" | "VPS" | null,
    generation,
    manifest,
    lastSync,
    expectedSourceRevision,
    routeHost: value.routeHost as VttObservedHost,
    transition,
    hosts: { HOME: home, VPS: vps },
    lastAction,
    completedActions: completedActions.filter(
      (action): action is VttHostLastAction => action !== null && action !== undefined,
    ),
    pendingAuditCount,
    auditBacklogBlocked,
    controlEnabled: true,
  };
}

function sanitizeControllerFailure(
  payload: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): VttHostActionFailure {
  const candidate = isRecord(payload) ? payload : {};
  const connectedUsers = parseNonNegativeInteger(candidate.connectedUsers);
  return {
    ok: false,
    ...(typeof candidate.requestId === "string"
      ? { requestId: candidate.requestId.slice(0, 128) }
      : {}),
    code: typeof candidate.code === "string"
      ? candidate.code.slice(0, 64)
      : fallbackCode,
    error: typeof candidate.error === "string"
      ? candidate.error.slice(0, 300)
      : fallbackMessage,
    ...(connectedUsers === null ? {} : { connectedUsers }),
  };
}

function actionMatchesInput(
  action: VttHostLastAction | VttHostTransition | null,
  input: VttHostControllerActionInput,
): boolean {
  if (
    !action ||
    action.requestId !== input.requestId ||
    action.action !== input.action ||
    action.targetHost !== input.targetHost
  ) {
    return false;
  }
  if (input.action === "SYNC_DATA") {
    return action.sourceHost === input.sourceHost && action.force === false;
  }
  return action.force === false;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ControllerTransportError("제어 응답이 너무 큽니다.");
  }
  if (!response.body) {
    throw new ControllerTransportError("제어 응답 본문이 없습니다.");
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ControllerTransportError("제어 응답이 너무 큽니다.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new ControllerTransportError("제어 응답이 JSON이 아닙니다.");
  }
}

async function requestController(
  configuration: HostControlConfiguration,
  options: ControllerRequestOptions,
): Promise<ControllerResponse> {
  if (!configuration.enabled || !configuration.url) {
    throw new ControllerTransportError("호스트 제어 기능이 비활성화되어 있습니다.");
  }
  const body = options.body ?? "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = createVttControlNonce();
  const signature = signVttControlRequest({
    secret: configuration.hmacSecret,
    method: options.method,
    pathname: options.pathname,
    timestamp,
    nonce,
    body,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(new URL(options.pathname, configuration.url), {
      method: options.method,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
        "CF-Access-Client-Id": configuration.cfAccessClientId,
        "CF-Access-Client-Secret": configuration.cfAccessClientSecret,
        "x-nochichim-control-timestamp": timestamp,
        "x-nochichim-control-nonce": nonce,
        "x-nochichim-control-signature": signature,
      },
      ...(options.method === "POST" ? { body } : {}),
    });
    return {
      status: response.status,
      ok: response.ok,
      payload: await readResponsePayload(response),
    };
  } catch (error) {
    if (error instanceof ControllerTransportError) throw error;
    throw new ControllerTransportError(
      error instanceof Error
        ? error.message
        : "호스트 제어기에 연결하지 못했습니다.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function waitBeforeStatusRetry(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 150));
}

export async function getVttHostStatus(): Promise<VttHostStatus> {
  const configuration = readControlConfiguration();
  if (!configuration.enabled) {
    return unavailableStatus(
      configuration.unavailableReason ?? "CONTROL_DISABLED",
      false,
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestController(configuration, {
        method: "GET",
        pathname: STATUS_PATH,
        timeoutMs: 4_000,
      });
      if (response.ok) {
        const status = parseHostStatus(response.payload);
        return status ?? unavailableStatus("INVALID_CONTROLLER_RESPONSE", true);
      }
      if (response.status >= 500 && attempt === 0) {
        await waitBeforeStatusRetry();
        continue;
      }
      return unavailableStatus(
        response.status === 401 || response.status === 403
          ? "CONTROLLER_REJECTED"
          : "CONTROLLER_UNREACHABLE",
        true,
      );
    } catch {
      if (attempt === 0) {
        await waitBeforeStatusRetry();
        continue;
      }
      return unavailableStatus("CONTROLLER_UNREACHABLE", true);
    }
  }
  return unavailableStatus("CONTROLLER_UNREACHABLE", true);
}

export async function performVttHostAction(
  input: VttHostControllerActionInput,
): Promise<VttHostControllerActionResult> {
  const configuration = readControlConfiguration();
  if (!configuration.enabled) {
    return {
      status: 503,
      body: {
        ok: false,
        requestId: input.requestId,
        code: configuration.unavailableReason ?? "CONTROL_DISABLED",
        error: "현재 환경에서는 VTT 경로·동기화 제어가 비활성화되어 있습니다.",
      },
    };
  }

  const body = JSON.stringify(input);
  let response: ControllerResponse;
  try {
    response = await requestController(configuration, {
      method: "POST",
      pathname: ACTIONS_PATH,
      body,
      timeoutMs: 28_000,
    });
  } catch {
    return {
      status: 504,
      body: {
        ok: false,
        requestId: input.requestId,
        code: "ACTION_RESULT_UNKNOWN",
        error: "작업 요청 결과를 확정하지 못했습니다. 다시 보내지 말고 상태를 조회해 주세요.",
      },
    };
  }

  if (!response.ok) {
    if ([409, 423, 504].includes(response.status)) {
      return {
        status: response.status,
        body: sanitizeControllerFailure(
          response.payload,
          response.status === 504 ? "ACTION_RESULT_UNKNOWN" : "ACTION_FAILED",
          "VTT 경로·동기화 요청을 처리하지 못했습니다.",
        ),
      };
    }
    return {
      status: response.status >= 500 ? 503 : 502,
      body: {
        ok: false,
        requestId: input.requestId,
        code: "CONTROLLER_UNREACHABLE",
        error: "VTT 호스트 제어기가 요청을 처리하지 못했습니다.",
      },
    };
  }

  const candidate = isRecord(response.payload) ? response.payload : null;
  const status = parseHostStatus(candidate?.status);
  const responseAction = candidate?.action === undefined
    ? null
    : parseLastAction(candidate.action);
  const matchingResponseAction = actionMatchesInput(responseAction ?? null, input);
  const matchingTransition = actionMatchesInput(status?.transition ?? null, input);
  const matchingLastAction = actionMatchesInput(status?.lastAction ?? null, input);
  const correlatedRequestedAt = (
    matchingResponseAction
      ? responseAction?.requestedAt ?? null
      : matchingTransition
        ? status?.transition?.startedAt ?? null
        : matchingLastAction
          ? status?.lastAction?.requestedAt ?? null
          : null
  );
  const requestedAt = parseTimestamp(candidate?.requestedAt);
  const accepted = candidate?.accepted === true || response.status === 202;
  if (
    !candidate ||
    candidate.ok !== true ||
    typeof candidate.requestId !== "string" ||
    candidate.requestId !== input.requestId ||
    typeof candidate.result !== "string" ||
    ![
      "ACTION_ACCEPTED",
      "ROUTE_SELECTED",
      "ALREADY_SELECTED",
      "DATA_SYNCED",
      "SWITCHED",
      "ALREADY_ACTIVE",
    ].includes(candidate.result) ||
    !status ||
    requestedAt === null ||
    correlatedRequestedAt === null ||
    correlatedRequestedAt !== requestedAt ||
    (candidate.action !== undefined && !matchingResponseAction) ||
    (response.status === 202 && candidate.accepted !== true)
  ) {
    return {
      status: 502,
      body: {
        ok: false,
        requestId: input.requestId,
        code: "INVALID_CONTROLLER_RESPONSE",
        error: "VTT 호스트 제어기의 응답 형식이 올바르지 않습니다.",
      },
    };
  }

  const success: VttHostActionSuccess = {
    ok: true,
    accepted,
    requestId: candidate.requestId.slice(0, 128),
    requestedAt,
    result: candidate.result.slice(0, 64),
    status,
    ...(candidate.replayed === true ? { replayed: true } : {}),
    auditRecorded: false,
  };
  return { status: response.status === 202 ? 202 : 200, body: success };
}

export async function acknowledgeVttHostAudits(
  requestIds: string[],
): Promise<void> {
  const uniqueRequestIds = [...new Set(requestIds)];
  if (
    uniqueRequestIds.length !== requestIds.length ||
    uniqueRequestIds.some(requestId => !REQUEST_ID_PATTERN.test(requestId))
  ) {
    throw new ControllerTransportError("감사 ACK request ID가 올바르지 않습니다.");
  }
  if (uniqueRequestIds.length === 0) return;

  const configuration = readControlConfiguration();
  if (!configuration.enabled) {
    throw new ControllerTransportError("호스트 제어 기능이 비활성화되어 있습니다.");
  }

  const batches = Array.from(
    { length: Math.ceil(uniqueRequestIds.length / MAX_AUDIT_ACK_IDS) },
    (_, index) => uniqueRequestIds.slice(
      index * MAX_AUDIT_ACK_IDS,
      (index + 1) * MAX_AUDIT_ACK_IDS,
    ),
  );
  await Promise.all(batches.map(async batch => {
    const response = await requestController(configuration, {
      method: "POST",
      pathname: AUDIT_ACKS_PATH,
      body: JSON.stringify({ requestIds: batch }),
      timeoutMs: 4_000,
    });
    const payload = isRecord(response.payload) ? response.payload : null;
    const acknowledged = Array.isArray(payload?.acknowledged)
      ? payload.acknowledged
      : null;
    if (
      !response.ok ||
      payload?.ok !== true ||
      !acknowledged ||
      acknowledged.length !== batch.length ||
      acknowledged.some((requestId, index) => requestId !== batch[index]) ||
      parseNonNegativeInteger(payload.pendingCount) === null
    ) {
      throw new ControllerTransportError("감사 ACK 응답이 올바르지 않습니다.");
    }
  }));
}
