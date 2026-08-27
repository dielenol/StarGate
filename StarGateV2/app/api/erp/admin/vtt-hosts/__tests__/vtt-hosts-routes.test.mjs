import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  session: null,
  actionCalls: [],
  auditCalls: [],
  auditAckCalls: [],
  auditPayloadByDedupeKey: new Map(),
  failAudit: false,
  actionFailure: null,
  completed: false,
};
globalThis.__vttHostRouteTestState = state;
const webRoot = new URL("../../../../../../", import.meta.url);
const hostAuditModuleUrl = new URL(
  "lib/vtt-runtime/host-audit.ts",
  webRoot,
).href;

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
          export function after(work) { void work(); }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/auth/active-session") {
      return {
        url: moduleUrl(`
          export async function getActiveSession() {
            return globalThis.__vttHostRouteTestState.session;
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
    if (specifier === "@/lib/vtt-runtime/host-control-client") {
      return {
        url: moduleUrl(`
          function runtime(state, users = 0) {
            return {
              state,
              reachable: true,
              connectedUsers: users,
              startedAt: state === "RUNNING" ? 1787321400000 : null,
              sourceRevision: "abc123"
            };
          }
          function status(requestId = "host-status-test-01") {
            return {
              state: "SWITCHING",
              activeHost: "HOME",
              desiredHost: "VPS",
              lastWriterHost: "HOME",
              generation: 4,
              manifest: {
                digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                fileCount: 166,
                totalBytes: 220000000
              },
              routeHost: "OFFLINE",
              transition: {
                requestId,
                sourceHost: "HOME",
                targetHost: "VPS",
                phase: "CLOSING_PUBLIC",
                force: false,
                actor: { id: "gm-1", displayName: "테스트 GM" },
                startedAt: 1787321400000,
                updatedAt: 1787321400000,
                error: null
              },
              hosts: {
                HOME: runtime("RUNNING", 0),
                VPS: runtime("STOPPED", 0)
              },
              lastAction: null,
              completedActions: [],
              pendingAuditCount: 0,
              auditBacklogBlocked: false,
              controlEnabled: true
            };
          }
          export async function getVttHostStatus() {
            const current = status();
            if (!globalThis.__vttHostRouteTestState.completed) return current;
            const completedAction = {
              requestId: "vtt-host-completed-01",
              action: "SWITCH_HOST",
              sourceHost: "HOME",
              targetHost: "VPS",
              force: false,
              actor: { id: "gm-1", displayName: "테스트 GM" },
              requestedAt: 1787321400000,
              completedAt: 1787321460000,
              result: "SWITCHED",
              generation: 5,
              sourceRevision: "abc123",
              code: null
            };
            return {
              ...current,
              state: "RUNNING",
              activeHost: "VPS",
              desiredHost: "VPS",
              lastWriterHost: "VPS",
              generation: 5,
              routeHost: "VPS",
              transition: null,
              hosts: {
                HOME: runtime("STOPPED", 0),
                VPS: runtime("RUNNING", 0)
              },
              lastAction: completedAction,
              completedActions: [completedAction],
              pendingAuditCount: 1
            };
          }
          export async function acknowledgeVttHostAudits(requestIds) {
            globalThis.__vttHostRouteTestState.auditAckCalls.push([...requestIds]);
          }
          export async function performVttHostAction(input) {
            const state = globalThis.__vttHostRouteTestState;
            state.actionCalls.push(input);
            if (state.actionFailure) return state.actionFailure;
            return {
              status: 202,
              body: {
                ok: true,
                accepted: true,
                requestId: input.requestId,
                requestedAt: 1787321400000,
                result: "TRANSITION_ACCEPTED",
                status: status(input.requestId),
                auditRecorded: false
              }
            };
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/host-audit") {
      return { url: hostAuditModuleUrl, shortCircuit: true };
    }
    if (specifier === "@/lib/notifications/gm-admin-audit") {
      return {
        url: moduleUrl(`
          export async function findMissingGmAdminAuditDedupeKeys(keys) {
            return keys;
          }
          export async function scheduleGmAdminAudit(payload, options) {
            const state = globalThis.__vttHostRouteTestState;
            if (state.failAudit) throw new Error("AUDIT_FAILED");
            const serialized = JSON.stringify(payload);
            const existing = state.auditPayloadByDedupeKey.get(options.dedupeKey);
            if (existing && existing !== serialized) {
              throw new Error("INTEGRATION_OUTBOX_CONFLICT");
            }
            state.auditPayloadByDedupeKey.set(options.dedupeKey, serialized);
            state.auditCalls.push({ payload, options });
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
  requestId = "vtt-host-route-01",
  body = { targetHost: "VPS" },
} = {}) {
  return new Request("https://www.ordonet.co.kr/api/erp/admin/vtt-hosts/actions", {
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
  state.auditAckCalls.length = 0;
  state.auditPayloadByDedupeKey.clear();
  state.failAudit = false;
  state.actionFailure = null;
  state.completed = false;
});

test("v2 상태 API는 비로그인 401, 비GM 403, GM 200을 반환한다", async () => {
  assert.equal((await statusRoute.GET()).status, 401);
  state.session = session("V");
  assert.equal((await statusRoute.GET()).status, 403);
  state.session = session("GM");
  const response = await statusRoute.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "SWITCHING");
});

test("완료된 전환은 status 조회에서 최종 상태를 request ID로 감사 조정한다", async () => {
  state.session = session("GM");
  state.completed = true;
  const response = await statusRoute.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "RUNNING");
  assert.equal(state.auditCalls.length, 1);
  assert.equal(
    state.auditCalls[0].options.dedupeKey,
    "vtt-host-completed:vtt-host-completed-01",
  );
  assert.equal(state.auditCalls[0].payload.details[1].value, "HOME");
  assert.equal(state.auditCalls[0].payload.details[2].value, "VPS");
  assert.equal(state.auditCalls[0].payload.details[4].value, "abc123");
  assert.deepEqual(state.auditAckCalls, [["vtt-host-completed-01"]]);
});

test("v2 조작 API는 인증·same-origin·body 실패 시 controller를 호출하지 않는다", async () => {
  assert.equal((await actionRoute.POST(actionRequest())).status, 401);
  state.session = session("V");
  assert.equal((await actionRoute.POST(actionRequest())).status, 403);
  state.session = session("GM");
  assert.equal((await actionRoute.POST(actionRequest({ origin: "https://evil.example" }))).status, 403);
  assert.equal((await actionRoute.POST(actionRequest({ body: { targetHost: "LAPTOP" } }))).status, 400);
  assert.equal(state.actionCalls.length, 0);
});

test("유효한 GM 요청은 고정 SWITCH_HOST·actor·request ID를 붙이고 202를 보존한다", async () => {
  state.session = session("GM");
  const response = await actionRoute.POST(actionRequest({
    requestId: "vtt-host-route-vps-01",
  }));
  assert.equal(response.status, 202);
  assert.deepEqual(state.actionCalls, [{
    action: "SWITCH_HOST",
    targetHost: "VPS",
    requestId: "vtt-host-route-vps-01",
    force: false,
    actor: { id: "gm-1", displayName: "테스트 GM" },
  }]);
  assert.equal(state.auditCalls.length, 1);
  assert.equal(state.auditCalls[0].options.dedupeKey, "vtt-host:vtt-host-route-vps-01");
  assert.equal(state.auditCalls[0].payload.action, "Nochichim VTT 호스트 전환 요청 접수");
  assert.equal(state.auditCalls[0].payload.details[1].value, "컨트롤러가 전환 요청을 접수한 사실");
});

test("같은 request ID replay의 접수 감사 payload는 outbox dedupe와 동일하게 유지된다", async () => {
  state.session = session("GM");
  const requestId = "vtt-host-route-replay-01";
  assert.equal((await actionRoute.POST(actionRequest({ requestId }))).status, 202);
  assert.equal((await actionRoute.POST(actionRequest({ requestId }))).status, 202);
  assert.equal(state.actionCalls.length, 2);
  assert.equal(state.auditCalls.length, 2);
  assert.equal(state.auditCalls[0].options.dedupeKey, `vtt-host:${requestId}`);
  assert.equal(state.auditCalls[1].options.dedupeKey, `vtt-host:${requestId}`);
  assert.deepEqual(state.auditCalls[1].payload, state.auditCalls[0].payload);
  assert.equal(
    state.auditCalls[0].payload.timestamp.getTime(),
    1_787_321_400_000,
  );
});

test("controller의 접속자 차단은 409를 보존하고 감사를 적재하지 않는다", async () => {
  state.session = session("GM");
  state.actionFailure = {
    status: 409,
    body: {
      ok: false,
      requestId: "vtt-host-route-block-01",
      code: "ACTIVE_CONNECTIONS",
      error: "접속자가 있습니다.",
      connectedUsers: 3,
    },
  };
  const response = await actionRoute.POST(actionRequest({
    requestId: "vtt-host-route-block-01",
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).connectedUsers, 3);
  assert.equal(state.actionCalls.length, 1);
  assert.equal(state.auditCalls.length, 0);
});

test("감사 outbox 실패는 접수된 controller 명령을 재실행하지 않는다", async () => {
  state.session = session("GM");
  state.failAudit = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await actionRoute.POST(actionRequest({
      requestId: "vtt-host-route-audit-01",
      body: { targetHost: "OFFLINE", force: true },
    }));
  } finally {
    console.error = originalConsoleError;
  }
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.ok, true);
  assert.equal(body.auditRecorded, false);
  assert.equal(state.actionCalls.length, 1);
});
