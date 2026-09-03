import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  session: null,
  actionCalls: [],
  auditCalls: [],
  failAudit: false,
  hostControlEnabled: true,
  hostStatus: null,
};
globalThis.__vttRuntimeRouteTestState = state;

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return {
        url: moduleUrl(`
          export const NextResponse = {
            json(value, init) { return Response.json(value, init); }
          };
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/active-session") {
      return {
        url: moduleUrl(`
          export async function getActiveSession() {
            return globalThis.__vttRuntimeRouteTestState.session;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/rbac") {
      return {
        url: moduleUrl(`
          export function hasRole(role, required) { return role === required; }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/api/idempotency") {
      return {
        url: moduleUrl(`
          const pattern = /^[A-Za-z0-9:_-]{8,128}$/;
          export function readIdempotencyKey(request) {
            const value = request.headers.get("Idempotency-Key")?.trim() ?? "";
            return pattern.test(value) ? value : null;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/control-client") {
      return {
        url: moduleUrl(`
          export async function getVttRuntimeStatus() {
            return {
              state: "STOPPED", desiredState: "STOPPED", connectedUsers: 0,
              startedAt: null, sourceRevision: null, lastAction: null,
              controlEnabled: true
            };
          }
          export async function performVttRuntimeAction(input) {
            globalThis.__vttRuntimeRouteTestState.actionCalls.push(input);
            return {
              status: 200,
              body: {
                ok: true,
                requestId: input.requestId,
                result: input.action === "START" ? "STARTED" : "STOPPED",
                previousState: input.action === "START" ? "STOPPED" : "RUNNING",
                status: {
                  state: input.action === "START" ? "RUNNING" : "STOPPED",
                  desiredState: input.action === "START" ? "RUNNING" : "STOPPED",
                  connectedUsers: 0,
                  startedAt: input.action === "START" ? Date.now() : null,
                  sourceRevision: "abc123",
                  lastAction: null,
                  controlEnabled: true
                },
                auditRecorded: false
              }
            };
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/host-control-client") {
      return {
        url: moduleUrl(`
          export function isVttHostControlModeEnabled() {
            return globalThis.__vttRuntimeRouteTestState.hostControlEnabled;
          }
          export async function getVttHostStatus() {
            const state = globalThis.__vttRuntimeRouteTestState;
            return state.hostStatus ?? {
              state: "OFFLINE",
              routeHost: "VPS",
              transition: null,
              controlEnabled: true,
              hosts: {
                HOME: { state: "STOPPED", reachable: true },
                VPS: { state: "STOPPED", reachable: true }
              }
            };
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/notifications/gm-admin-audit") {
      return {
        url: moduleUrl(`
          export async function scheduleGmAdminAudit(payload, options) {
            const state = globalThis.__vttRuntimeRouteTestState;
            state.auditCalls.push({ payload, options });
            if (state.failAudit) throw new Error("AUDIT_FAILED");
          }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const statusRoute = await import(`../route.ts?test=${Date.now()}`);
const actionRoute = await import(`../actions/route.ts?test=${Date.now()}`);

function session(role = "GM") {
  return {
    user: {
      id: "gm-1",
      displayName: "테스트 GM",
      role,
    },
  };
}

function actionRequest({
  origin = "https://www.ordonet.co.kr",
  requestId = "vtt-route-test-01",
  body = { action: "START" },
} = {}) {
  return new Request("https://www.ordonet.co.kr/api/erp/admin/vtt-runtime/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      "Idempotency-Key": requestId,
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  state.session = null;
  state.actionCalls.length = 0;
  state.auditCalls.length = 0;
  state.failAudit = false;
  state.hostControlEnabled = true;
  state.hostStatus = null;
});

test("상태 API는 비로그인 401, 비GM 403, GM 200을 반환한다", async () => {
  assert.equal((await statusRoute.GET()).status, 401);
  state.session = session("V");
  assert.equal((await statusRoute.GET()).status, 403);
  state.session = session("GM");
  const response = await statusRoute.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "STOPPED");
});

test("조작 API는 인증과 same-origin 실패 시 controller를 호출하지 않는다", async () => {
  assert.equal((await actionRoute.POST(actionRequest())).status, 401);
  state.session = session("V");
  assert.equal((await actionRoute.POST(actionRequest())).status, 403);
  state.session = session("GM");
  assert.equal((await actionRoute.POST(actionRequest({ origin: "https://evil.example" }))).status, 403);
  assert.equal(state.actionCalls.length, 0);
});

test("유효한 GM 요청만 서버 actor와 request ID를 붙여 controller를 호출한다", async () => {
  state.session = session("GM");
  const response = await actionRoute.POST(actionRequest({
    requestId: "vtt-route-start-01",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(state.actionCalls, [{
    action: "START",
    requestId: "vtt-route-start-01",
    force: false,
    actor: { id: "gm-1", displayName: "테스트 GM" },
  }]);
  assert.equal(state.auditCalls.length, 1);
  assert.equal(state.auditCalls[0].options.dedupeKey, "vtt-runtime:vtt-route-start-01");
});

test("분리 모드의 VPS START는 VPS 경로와 HOME 정지를 서버에서 강제한다", async () => {
  state.session = session("GM");
  state.hostStatus = {
    state: "RUNNING",
    routeHost: "HOME",
    transition: null,
    controlEnabled: true,
    hosts: {
      HOME: { state: "RUNNING", reachable: true },
      VPS: { state: "STOPPED", reachable: true },
    },
  };
  const wrongRoute = await actionRoute.POST(actionRequest({
    requestId: "vtt-start-wrong-route-01",
  }));
  assert.equal(wrongRoute.status, 409);
  assert.equal((await wrongRoute.json()).code, "VPS_ROUTE_NOT_SELECTED");
  assert.equal(state.actionCalls.length, 0);

  state.hostStatus = {
    ...state.hostStatus,
    routeHost: "VPS",
  };
  const homeRunning = await actionRoute.POST(actionRequest({
    requestId: "vtt-start-home-running-01",
  }));
  assert.equal(homeRunning.status, 409);
  assert.equal((await homeRunning.json()).code, "HOME_NOT_STOPPED");
  assert.equal(state.actionCalls.length, 0);

  state.hostStatus = {
    ...state.hostStatus,
    state: "SWITCHING",
    transition: { phase: "LOCKING_DATA" },
  };
  const operationLocked = await actionRoute.POST(actionRequest({
    requestId: "vtt-start-operation-lock-01",
  }));
  assert.equal(operationLocked.status, 423);
  assert.equal((await operationLocked.json()).code, "HOST_OPERATION_LOCKED");
  assert.equal(state.actionCalls.length, 0);
});

test("기존 로컬 Tunnel이 꺼져 HOME agent가 응답하지 않아도 VPS START를 허용한다", async () => {
  state.session = session("GM");
  state.hostStatus = {
    state: "DEGRADED",
    routeHost: "VPS",
    transition: null,
    controlEnabled: true,
    hosts: {
      HOME: { state: "UNREACHABLE", reachable: false },
      VPS: { state: "STOPPED", reachable: true },
    },
  };
  const response = await actionRoute.POST(actionRequest({
    requestId: "vtt-start-home-legacy-off-01",
  }));
  assert.equal(response.status, 200);
  assert.equal(state.actionCalls.length, 1);
  assert.equal(state.actionCalls[0].action, "START");
});

test("분리 모드가 꺼진 기존 배포는 v1 START 계약을 그대로 유지한다", async () => {
  state.session = session("GM");
  state.hostControlEnabled = false;
  const response = await actionRoute.POST(actionRequest({
    requestId: "vtt-start-legacy-mode-01",
  }));
  assert.equal(response.status, 200);
  assert.equal(state.actionCalls.length, 1);
});

test("감사 outbox 실패는 성공한 controller 명령을 재실행하지 않는다", async () => {
  state.session = session("GM");
  state.failAudit = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await actionRoute.POST(actionRequest({
      requestId: "vtt-route-audit-01",
      body: { action: "STOP", force: true },
    }));
  } finally {
    console.error = originalConsoleError;
  }
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.auditRecorded, false);
  assert.equal(state.actionCalls.length, 1);
});
