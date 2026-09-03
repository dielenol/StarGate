import "server-only";

import type {
  VttRuntimeAction,
  VttRuntimeActionFailure,
  VttRuntimeActionResponse,
  VttRuntimeActionSuccess,
  VttRuntimeLastAction,
  VttRuntimeState,
  VttRuntimeStatus,
} from "@/types/vtt-runtime";

import {
  createVttControlNonce,
  signVttControlRequest,
} from "@/lib/vtt-runtime/signature";

const STATUS_PATH = "/v1/status";
const ACTIONS_PATH = "/v1/actions";
const VALID_STATES = new Set<VttRuntimeState>([
  "RUNNING",
  "STOPPED",
  "STARTING",
  "STOPPING",
  "DEGRADED",
  "UNREACHABLE",
]);
const MAX_RESPONSE_BYTES = 64 * 1024;

interface ControlConfiguration {
  enabled: boolean;
  url: URL | null;
  hmacSecret: string;
  cfAccessClientId: string;
  cfAccessClientSecret: string;
  unavailableReason?: VttRuntimeStatus["unavailableReason"];
}

interface ControllerRequestOptions {
  method: "GET" | "POST";
  pathname: typeof STATUS_PATH | typeof ACTIONS_PATH;
  body?: string;
  timeoutMs: number;
}

interface ControllerResponse {
  status: number;
  ok: boolean;
  payload: unknown;
}

export interface VttRuntimeControllerActionInput {
  action: VttRuntimeAction;
  requestId: string;
  force: boolean;
  actor: { id: string; displayName: string };
}

export interface VttRuntimeControllerActionResult {
  status: number;
  body: VttRuntimeActionResponse;
}

class ControllerTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControllerTransportError";
  }
}

function unavailableStatus(
  reason: NonNullable<VttRuntimeStatus["unavailableReason"]>,
  controlEnabled: boolean,
): VttRuntimeStatus {
  return {
    state: "UNREACHABLE",
    desiredState: null,
    connectedUsers: null,
    startedAt: null,
    sourceRevision: null,
    lastAction: null,
    controlEnabled,
    unavailableReason: reason,
  };
}

function readControlConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): ControlConfiguration {
  const requested = env.NOCHICHIM_CONTROL_ENABLED === "true";
  if (!requested || env.VERCEL_ENV !== "production") {
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
    url = new URL(env.NOCHICHIM_CONTROL_URL ?? "");
  } catch {
    // 아래 공통 구성 검증에서 fail closed 한다.
  }
  const hmacSecret = env.NOCHICHIM_CONTROL_HMAC_SECRET ?? "";
  const cfAccessClientId = env.NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_ID ?? "";
  const cfAccessClientSecret = env.NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_SECRET ?? "";
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

function parseLastAction(value: unknown): VttRuntimeLastAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = value as Record<string, unknown>;
  if (
    typeof action.requestId !== "string" ||
    (action.action !== "START" && action.action !== "STOP") ||
    typeof action.force !== "boolean" ||
    typeof action.requestedAt !== "number" ||
    typeof action.completedAt !== "number" ||
    typeof action.result !== "string"
  ) {
    return null;
  }
  let actor: VttRuntimeLastAction["actor"] = null;
  if (action.actor && typeof action.actor === "object" && !Array.isArray(action.actor)) {
    const candidate = action.actor as Record<string, unknown>;
    if (typeof candidate.id === "string" && typeof candidate.displayName === "string") {
      actor = {
        id: candidate.id.slice(0, 128),
        displayName: candidate.displayName.slice(0, 100),
      };
    }
  }
  return {
    requestId: action.requestId.slice(0, 128),
    action: action.action,
    force: action.force,
    actor,
    requestedAt: action.requestedAt,
    completedAt: action.completedAt,
    result: action.result.slice(0, 64),
  };
}

function parseRuntimeStatus(value: unknown): VttRuntimeStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = value as Record<string, unknown>;
  if (typeof status.state !== "string" || !VALID_STATES.has(status.state as VttRuntimeState)) {
    return null;
  }
  if (
    status.desiredState !== null &&
    status.desiredState !== "RUNNING" &&
    status.desiredState !== "STOPPED"
  ) {
    return null;
  }
  const connectedUsers = status.connectedUsers;
  if (
    connectedUsers !== null &&
    (typeof connectedUsers !== "number" ||
      !Number.isSafeInteger(connectedUsers) ||
      connectedUsers < 0)
  ) {
    return null;
  }
  const startedAt = status.startedAt;
  if (
    startedAt !== null &&
    (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt < 0)
  ) {
    return null;
  }
  const sourceRevision = status.sourceRevision;
  if (sourceRevision !== null && typeof sourceRevision !== "string") return null;

  return {
    state: status.state as VttRuntimeState,
    desiredState: status.desiredState as VttRuntimeStatus["desiredState"],
    connectedUsers: connectedUsers as number | null,
    startedAt: startedAt as number | null,
    sourceRevision: sourceRevision === null ? null : sourceRevision.slice(0, 128),
    lastAction: parseLastAction(status.lastAction),
    controlEnabled: true,
  };
}

function sanitizeControllerFailure(
  payload: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): VttRuntimeActionFailure {
  const candidate = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const connectedUsers = candidate.connectedUsers;
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
    ...(typeof connectedUsers === "number" &&
    Number.isSafeInteger(connectedUsers) &&
    connectedUsers >= 0
      ? { connectedUsers }
      : {}),
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new ControllerTransportError("제어 응답이 너무 큽니다.");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new ControllerTransportError("제어 응답이 너무 큽니다.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ControllerTransportError("제어 응답이 JSON이 아닙니다.");
  }
}

async function requestController(
  configuration: ControlConfiguration,
  options: ControllerRequestOptions,
): Promise<ControllerResponse> {
  if (!configuration.enabled || !configuration.url) {
    throw new ControllerTransportError("제어 기능이 비활성화되어 있습니다.");
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
      error instanceof Error ? error.message : "제어 호스트에 연결하지 못했습니다.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function waitBeforeStatusRetry(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 150));
}

export async function getVttRuntimeStatus(): Promise<VttRuntimeStatus> {
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
        const status = parseRuntimeStatus(response.payload);
        return status ?? unavailableStatus("INVALID_CONTROLLER_RESPONSE", true);
      }
      const shouldRetry = response.status >= 500 && attempt === 0;
      if (shouldRetry) {
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

export async function performVttRuntimeAction(
  input: VttRuntimeControllerActionInput,
): Promise<VttRuntimeControllerActionResult> {
  const configuration = readControlConfiguration();
  if (!configuration.enabled) {
    return {
      status: 503,
      body: {
        ok: false,
        requestId: input.requestId,
        code: configuration.unavailableReason ?? "CONTROL_DISABLED",
        error: "현재 환경에서는 VTT 원격 제어가 비활성화되어 있습니다.",
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
        error: "제어 응답을 받지 못했습니다. 명령을 다시 보내지 말고 상태를 조회해 주세요.",
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
          "VTT 제어 명령을 완료하지 못했습니다.",
        ),
      };
    }
    return {
      status: response.status >= 500 ? 503 : 502,
      body: {
        ok: false,
        requestId: input.requestId,
        code: "CONTROLLER_UNREACHABLE",
        error: "VTT 제어 호스트가 요청을 처리하지 못했습니다.",
      },
    };
  }

  const candidate = response.payload && typeof response.payload === "object"
    ? response.payload as Record<string, unknown>
    : null;
  const status = parseRuntimeStatus(candidate?.status);
  if (
    !candidate ||
    candidate.ok !== true ||
    typeof candidate.requestId !== "string" ||
    candidate.requestId !== input.requestId ||
    typeof candidate.result !== "string" ||
    typeof candidate.previousState !== "string" ||
    !VALID_STATES.has(candidate.previousState as VttRuntimeState) ||
    !status
  ) {
    return {
      status: 502,
      body: {
        ok: false,
        requestId: input.requestId,
        code: "INVALID_CONTROLLER_RESPONSE",
        error: "VTT 제어 호스트의 응답 형식이 올바르지 않습니다.",
      },
    };
  }

  const success: VttRuntimeActionSuccess = {
    ok: true,
    requestId: candidate.requestId.slice(0, 128),
    result: candidate.result.slice(0, 64),
    previousState: candidate.previousState as VttRuntimeState,
    status,
    ...(candidate.replayed === true ? { replayed: true } : {}),
    auditRecorded: false,
  };
  return { status: 200, body: success };
}
