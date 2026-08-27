import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = {
  controllerStatus: {
    state: "RUNNING",
    controlEnabled: true,
    unavailableReason: undefined,
    lastAction: { requestId: "vtt-host-cron-01" },
  },
  reconcileCalls: 0,
  failReconcile: false,
};
globalThis.__vttHostAuditCronTestState = state;

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
    if (specifier === "@/lib/vtt-runtime/host-control-client") {
      return {
        url: moduleUrl(`
          export async function getVttHostStatus() {
            return globalThis.__vttHostAuditCronTestState.controllerStatus;
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/host-audit") {
      return {
        url: moduleUrl(`
          export async function reconcileCompletedVttHostAudit() {
            const state = globalThis.__vttHostAuditCronTestState;
            state.reconcileCalls += 1;
            if (state.failReconcile) throw new Error("AUDIT_FAILED");
            return { status: "QUEUED", requestIds: ["vtt-host-cron-01"] };
          }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const route = await import(
  `../../../app/api/cron/vtt-host-audits/route.ts?test=${Date.now()}`
);
const originalSecret = process.env.CRON_SECRET;

function request(secret = "cron-secret") {
  return new Request("https://www.ordonet.co.kr/api/cron/vtt-host-audits", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

test.beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret";
  state.controllerStatus = {
    state: "RUNNING",
    controlEnabled: true,
    unavailableReason: undefined,
    lastAction: { requestId: "vtt-host-cron-01" },
  };
  state.reconcileCalls = 0;
  state.failReconcile = false;
});

test.after(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

test("Cron은 CRON_SECRET 불일치 요청을 controller 호출 전에 401로 차단한다", async () => {
  const response = await route.GET(request("wrong-secret"));
  assert.equal(response.status, 401);
  assert.equal(state.reconcileCalls, 0);
});

test("Cron은 브라우저 요청 없이 완료 audit 조정을 실행한다", async () => {
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).reconciliation, {
    status: "QUEUED",
    requestIds: ["vtt-host-cron-01"],
  });
  assert.equal(state.reconcileCalls, 1);
});

test("controller 불능과 outbox 실패를 성공으로 오인하지 않는다", async () => {
  state.controllerStatus = {
    state: "UNREACHABLE",
    controlEnabled: true,
    unavailableReason: "CONTROLLER_UNREACHABLE",
    lastAction: null,
  };
  assert.equal((await route.GET(request())).status, 503);
  assert.equal(state.reconcileCalls, 0);

  state.controllerStatus.state = "RUNNING";
  state.failReconcile = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.equal((await route.GET(request())).status, 500);
  } finally {
    console.error = originalConsoleError;
  }
});
