import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const signatureUrl = new URL("../signature.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export {};")}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/signature") {
      return { url: signatureUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const {
  acknowledgeVttHostAudits,
  getVttHostStatus,
  isVttHostControlModeEnabled,
  performVttHostAction,
} = await import(`../host-control-client.ts?test=${Date.now()}`);
const { signVttControlRequest } = await import("../signature.ts");

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = [
  "NOCHICHIM_HOST_CONTROL_ENABLED",
  "NOCHICHIM_HOST_CONTROL_URL",
  "NOCHICHIM_HOST_CONTROL_HMAC_SECRET",
  "NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_ID",
  "NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_SECRET",
  "VERCEL_ENV",
];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function configureProduction() {
  process.env.NOCHICHIM_HOST_CONTROL_ENABLED = "true";
  process.env.NOCHICHIM_HOST_CONTROL_URL = "https://control.nochiijjim.com";
  process.env.NOCHICHIM_HOST_CONTROL_HMAC_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_ID = "cf-client-id";
  process.env.NOCHICHIM_HOST_CONTROL_CF_ACCESS_CLIENT_SECRET = "cf-client-secret";
  process.env.VERCEL_ENV = "production";
}

function restoreEnvironment() {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function runtimeStatus(overrides = {}) {
  return {
    state: "STOPPED",
    reachable: true,
    connectedUsers: 0,
    startedAt: null,
    sourceRevision: "abc123",
    ...overrides,
  };
}

function controllerStatus(overrides = {}) {
  return {
    state: "RUNNING",
    activeHost: "HOME",
    desiredHost: "HOME",
    lastWriterHost: "HOME",
    generation: 4,
    manifest: {
      digest: "a".repeat(64),
      fileCount: 166,
      totalBytes: 220_000_000,
    },
    lastSync: null,
    routeHost: "HOME",
    transition: null,
    hosts: {
      HOME: runtimeStatus({
        state: "RUNNING",
        connectedUsers: 2,
        startedAt: 1_787_321_400_000,
      }),
      VPS: runtimeStatus(),
    },
    lastAction: null,
    completedActions: [],
    pendingAuditCount: 0,
    auditBacklogBlocked: false,
    ...overrides,
  };
}

function completedAction(overrides = {}) {
  return {
    requestId: "vtt-host-completed-01",
    action: "SELECT_ROUTE",
    sourceHost: "HOME",
    targetHost: "VPS",
    force: false,
    actor: { id: "gm-1", displayName: "GM" },
    requestedAt: 1_787_321_400_000,
    completedAt: 1_787_321_460_000,
    result: "ROUTE_SELECTED",
    generation: 5,
    sourceRevision: "abc123",
    code: null,
    ...overrides,
  };
}

function actionInput(overrides = {}) {
  return {
    action: "SELECT_ROUTE",
    targetHost: "VPS",
    requestId: "vtt-host-action-01",
    actor: { id: "gm-1", displayName: "GM" },
    ...overrides,
  };
}

test.afterEach(restoreEnvironment);

test("Production의 별도 host flag가 없으면 v1 화면을 유지하고 controller를 호출하지 않는다", async () => {
  configureProduction();
  delete process.env.NOCHICHIM_HOST_CONTROL_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  assert.equal(isVttHostControlModeEnabled(), false);
  const status = await getVttHostStatus();
  assert.equal(status.state, "UNREACHABLE");
  assert.equal(status.controlEnabled, false);
  assert.equal(status.unavailableReason, "CONTROL_DISABLED");
  assert.equal(calls, 0);
});

test("Preview에서는 host flag가 있어도 fail closed한다", async () => {
  configureProduction();
  process.env.VERCEL_ENV = "preview";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  assert.equal(isVttHostControlModeEnabled(), false);
  const status = await getVttHostStatus();
  assert.equal(status.unavailableReason, "CONTROL_DISABLED");
  assert.equal(calls, 0);
});

test("고정 control host가 아니면 Cloudflare와 HMAC 인증값을 전송하지 않는다", async () => {
  configureProduction();
  process.env.NOCHICHIM_HOST_CONTROL_URL = "https://attacker.example";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  const status = await getVttHostStatus();
  assert.equal(status.unavailableReason, "CONTROL_MISCONFIGURED");
  assert.equal(calls, 0);
});

test("상태 GET은 v2 고정 path에 서버 인증을 붙이고 일시 실패를 한 번만 재시도한다", async () => {
  configureProduction();
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) throw new Error("temporary network error");
    return new Response(JSON.stringify(controllerStatus()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const status = await getVttHostStatus();
  assert.equal(status.activeHost, "HOME");
  assert.equal(status.controlEnabled, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "https://control.nochiijjim.com/v2/status");
  const headers = requests[1].init.headers;
  assert.equal(headers["CF-Access-Client-Id"], "cf-client-id");
  assert.equal(headers["CF-Access-Client-Secret"], "cf-client-secret");
  assert.equal(
    headers["x-nochichim-control-signature"],
    signVttControlRequest({
      secret: process.env.NOCHICHIM_HOST_CONTROL_HMAC_SECRET,
      method: "GET",
      pathname: "/v2/status",
      timestamp: headers["x-nochichim-control-timestamp"],
      nonce: headers["x-nochichim-control-nonce"],
      body: "",
    }),
  );
});

test("불완전하거나 모순된 controller 상태는 fail closed한다", async () => {
  configureProduction();
  globalThis.fetch = async () => new Response(JSON.stringify(controllerStatus({
    hosts: {
      HOME: runtimeStatus({ state: "RUNNING", reachable: false }),
      VPS: runtimeStatus(),
    },
  })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const status = await getVttHostStatus();
  assert.equal(status.state, "UNREACHABLE");
  assert.equal(status.unavailableReason, "INVALID_CONTROLLER_RESPONSE");

  globalThis.fetch = async () => new Response(JSON.stringify(controllerStatus({
    pendingAuditCount: 100,
    auditBacklogBlocked: false,
  })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const inconsistentAuditStatus = await getVttHostStatus();
  assert.equal(inconsistentAuditStatus.state, "UNREACHABLE");
  assert.equal(
    inconsistentAuditStatus.unavailableReason,
    "INVALID_CONTROLLER_RESPONSE",
  );

  globalThis.fetch = async () => new Response(JSON.stringify(controllerStatus({
    completedActions: [completedAction()],
    pendingAuditCount: 2,
  })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const hiddenPendingAudit = await getVttHostStatus();
  assert.equal(hiddenPendingAudit.state, "UNREACHABLE");
  assert.equal(
    hiddenPendingAudit.unavailableReason,
    "INVALID_CONTROLLER_RESPONSE",
  );

  const legacyStatus = controllerStatus();
  delete legacyStatus.completedActions;
  delete legacyStatus.pendingAuditCount;
  delete legacyStatus.auditBacklogBlocked;
  globalThis.fetch = async () => new Response(JSON.stringify(legacyStatus), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const missingAuditContract = await getVttHostStatus();
  assert.equal(missingAuditContract.state, "UNREACHABLE");
  assert.equal(
    missingAuditContract.unavailableReason,
    "INVALID_CONTROLLER_RESPONSE",
  );
});

test("controller의 최근 완료 receipt와 각 action generation을 보존한다", async () => {
  configureProduction();
  const first = completedAction();
  const second = completedAction({
    requestId: "vtt-host-completed-02",
    sourceHost: "VPS",
    targetHost: "HOME",
    generation: 6,
    sourceRevision: "def456",
  });
  globalThis.fetch = async () => new Response(JSON.stringify(controllerStatus({
    generation: 6,
    lastAction: second,
    completedActions: [first, second],
    pendingAuditCount: 2,
  })), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const status = await getVttHostStatus();
  assert.deepEqual(
    status.completedActions.map(action => ({
      requestId: action.requestId,
      generation: action.generation,
      sourceRevision: action.sourceRevision,
    })),
    [
      {
        requestId: "vtt-host-completed-01",
        generation: 5,
        sourceRevision: "abc123",
      },
      {
        requestId: "vtt-host-completed-02",
        generation: 6,
        sourceRevision: "def456",
      },
    ],
  );
  assert.equal(status.pendingAuditCount, 2);
  assert.equal(status.auditBacklogBlocked, false);
});

test("경로·동기화 POST transport 실패는 자동 재시도하지 않고 결과 불명으로 매핑한다", async () => {
  configureProduction();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("response lost");
  };

  const result = await performVttHostAction(actionInput());
  assert.equal(calls, 1);
  assert.equal(result.status, 504);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "ACTION_RESULT_UNKNOWN");
});

test("현재 요청과 timestamp 상관관계가 없는 성공 응답은 fail closed한다", async () => {
  configureProduction();
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    requestId: "vtt-host-action-01",
    requestedAt: 1_787_321_400_000,
    result: "ROUTE_SELECTED",
    status: controllerStatus({
      lastAction: completedAction({
        requestId: "vtt-host-other-action-01",
        requestedAt: 1_787_321_400_000,
      }),
    }),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const result = await performVttHostAction(actionInput());
  assert.equal(result.status, 502);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "INVALID_CONTROLLER_RESPONSE");
});

test("같은 request ID라도 다른 동기화 방향의 성공 응답은 fail closed한다", async () => {
  configureProduction();
  const input = {
    action: "SYNC_DATA",
    sourceHost: "HOME",
    targetHost: "VPS",
    requestId: "vtt-host-sync-direction-01",
    actor: { id: "gm-1", displayName: "GM" },
  };
  globalThis.fetch = async () => {
    const wrongDirection = completedAction({
      requestId: input.requestId,
      action: "SYNC_DATA",
      sourceHost: "VPS",
      targetHost: "HOME",
      result: "DATA_SYNCED",
    });
    return new Response(JSON.stringify({
      ok: true,
      requestId: input.requestId,
      requestedAt: wrongDirection.requestedAt,
      result: "DATA_SYNCED",
      action: wrongDirection,
      status: controllerStatus({ lastAction: wrongDirection }),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await performVttHostAction(input);
  assert.equal(result.status, 502);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "INVALID_CONTROLLER_RESPONSE");
});

test("명시적 동기화 성공은 방향과 lastSync manifest를 보존한다", async () => {
  configureProduction();
  const input = {
    action: "SYNC_DATA",
    sourceHost: "HOME",
    targetHost: "VPS",
    requestId: "vtt-host-sync-success-01",
    actor: { id: "gm-1", displayName: "GM" },
  };
  let sentBody = null;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    const action = completedAction({
      requestId: input.requestId,
      action: "SYNC_DATA",
      result: "DATA_SYNCED",
    });
    const manifest = {
      digest: "b".repeat(64),
      fileCount: 170,
      totalBytes: 230_000_000,
    };
    return new Response(JSON.stringify({
      ok: true,
      requestId: input.requestId,
      requestedAt: action.requestedAt,
      result: "DATA_SYNCED",
      action,
      status: controllerStatus({
        state: "OFFLINE",
        activeHost: "OFFLINE",
        desiredHost: "OFFLINE",
        routeHost: "OFFLINE",
        generation: 5,
        manifest,
        lastSync: {
          requestId: input.requestId,
          sourceHost: "HOME",
          targetHost: "VPS",
          generation: 5,
          manifest,
          completedAt: action.completedAt,
        },
        lastAction: action,
      }),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await performVttHostAction(input);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status.lastSync.sourceHost, "HOME");
  assert.equal(result.body.status.lastSync.targetHost, "VPS");
  assert.equal(result.body.status.lastSync.manifest.digest, "b".repeat(64));
  assert.equal(Object.hasOwn(sentBody, "force"), false);
});

test("Content-Length 없는 과대 응답도 128KB에서 stream을 취소한다", async () => {
  configureProduction();
  let cancelled = false;
  let pulls = 0;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(64 * 1024));
      if (pulls >= 10) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const result = await performVttHostAction(actionInput({
    requestId: "vtt-host-stream-limit-01",
  }));
  assert.equal(result.status, 504);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "ACTION_RESULT_UNKNOWN");
  assert.equal(cancelled, true);
  assert.ok(pulls <= 4, "reader must cancel before buffering the full response");
});

test("접속자 차단은 409와 인원수를 보존한다", async () => {
  configureProduction();
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    requestId: "vtt-host-action-01",
    code: "ACTIVE_CONNECTIONS",
    error: "접속자가 있어 전환을 차단했습니다.",
    connectedUsers: 4,
  }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });

  const result = await performVttHostAction(actionInput());
  assert.equal(result.status, 409);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "ACTIVE_CONNECTIONS");
  assert.equal(result.body.connectedUsers, 4);
});

test("202 접수 응답은 재전송하지 않고 작업 상태와 request ID를 보존한다", async () => {
  configureProduction();
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const input = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok: true,
      accepted: true,
      requestId: input.requestId,
      requestedAt: 1_787_321_400_000,
      result: "ACTION_ACCEPTED",
      status: controllerStatus({
        state: "SWITCHING",
        desiredHost: "VPS",
        routeHost: "OFFLINE",
        transition: {
          requestId: input.requestId,
          action: "SELECT_ROUTE",
          sourceHost: "HOME",
          targetHost: "VPS",
          phase: "CLOSING_PUBLIC",
          force: false,
          actor: input.actor,
          startedAt: 1_787_321_400_000,
          updatedAt: 1_787_321_400_000,
          error: null,
        },
      }),
    }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await performVttHostAction(actionInput());
  assert.equal(calls, 1);
  assert.equal(result.status, 202);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.accepted, true);
  assert.equal(result.body.requestedAt, 1_787_321_400_000);
  assert.equal(result.body.status.state, "SWITCHING");
  assert.equal(JSON.stringify(result.body).includes("control.nochiijjim.com"), false);
});

test("완료 뒤 replay도 receipt action의 최초 requestedAt을 보존한다", async () => {
  configureProduction();
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body);
    const replayedAction = completedAction({
      requestId: input.requestId,
      requestedAt: 1_787_321_411_111,
    });
    return new Response(JSON.stringify({
      ok: true,
      requestId: input.requestId,
      requestedAt: 1_787_321_411_111,
      result: "ROUTE_SELECTED",
      replayed: true,
      action: replayedAction,
      status: controllerStatus({
        lastAction: completedAction({
          requestId: "vtt-host-later-action-01",
          requestedAt: 1_787_321_500_000,
        }),
        completedActions: [],
      }),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await performVttHostAction(actionInput());
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.replayed, true);
  assert.equal(result.body.requestedAt, 1_787_321_411_111);
});

test("감사 ACK는 40개씩 나눠 서명하고 각 batch를 자동 재시도 없이 보낸다", async () => {
  configureProduction();
  const requests = [];
  const requestIds = Array.from(
    { length: 81 },
    (_, index) => `vtt-host-audit-${String(index).padStart(3, "0")}`,
  );
  let pendingCount = requestIds.length;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), init, body });
    pendingCount -= body.requestIds.length;
    return new Response(JSON.stringify({
      ok: true,
      acknowledged: body.requestIds,
      pendingCount,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await acknowledgeVttHostAudits(requestIds);
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map(request => request.body.requestIds.length),
    [40, 40, 1],
  );
  assert.equal(
    requests.every(request => (
      request.url === "https://control.nochiijjim.com/v2/audit-acks"
    )),
    true,
  );
  const first = requests[0];
  assert.equal(
    first.init.headers["x-nochichim-control-signature"],
    signVttControlRequest({
      secret: process.env.NOCHICHIM_HOST_CONTROL_HMAC_SECRET,
      method: "POST",
      pathname: "/v2/audit-acks",
      timestamp: first.init.headers["x-nochichim-control-timestamp"],
      nonce: first.init.headers["x-nochichim-control-nonce"],
      body: first.init.body,
    }),
  );
});

test("감사 ACK transport/응답 실패는 성공으로 처리하거나 자동 재시도하지 않는다", async () => {
  configureProduction();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("ack response lost");
  };
  await assert.rejects(
    acknowledgeVttHostAudits(["vtt-host-audit-failure-01"]),
    /ack response lost/,
  );
  assert.equal(calls, 1);

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    acknowledged: [],
    pendingCount: 1,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    acknowledgeVttHostAudits(["vtt-host-audit-invalid-01"]),
    /감사 ACK 응답이 올바르지 않습니다/,
  );
});
