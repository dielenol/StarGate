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
  getVttRuntimeStatus,
  performVttRuntimeAction,
} = await import(`../control-client.ts?test=${Date.now()}`);
const { signVttControlRequest } = await import("../signature.ts");

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = [
  "NOCHICHIM_CONTROL_ENABLED",
  "NOCHICHIM_HOST_CONTROL_ENABLED",
  "NOCHICHIM_CONTROL_URL",
  "NOCHICHIM_CONTROL_HMAC_SECRET",
  "NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_ID",
  "NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_SECRET",
  "VERCEL_ENV",
];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));

function configureProduction() {
  process.env.NOCHICHIM_CONTROL_ENABLED = "true";
  process.env.NOCHICHIM_CONTROL_URL = "https://control.nochiijjim.com";
  process.env.NOCHICHIM_CONTROL_HMAC_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_ID = "cf-client-id";
  process.env.NOCHICHIM_CONTROL_CF_ACCESS_CLIENT_SECRET = "cf-client-secret";
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

function controllerStatus(overrides = {}) {
  return {
    state: "RUNNING",
    desiredState: "RUNNING",
    connectedUsers: 2,
    startedAt: 1_787_321_400_000,
    sourceRevision: "abc123",
    lastAction: null,
    ...overrides,
  };
}

test.afterEach(restoreEnvironment);

test("Preview에서는 enabled 값이 있어도 fail closed하고 fetch하지 않는다", async () => {
  configureProduction();
  process.env.VERCEL_ENV = "preview";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  const status = await getVttRuntimeStatus();
  assert.equal(status.state, "UNREACHABLE");
  assert.equal(status.controlEnabled, false);
  assert.equal(status.unavailableReason, "CONTROL_DISABLED");
  assert.equal(calls, 0);
});

test("하이브리드 v2가 켜지면 legacy v1 직접 제어는 fail closed한다", async () => {
  configureProduction();
  process.env.NOCHICHIM_HOST_CONTROL_ENABLED = "true";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  const status = await getVttRuntimeStatus();
  assert.equal(status.controlEnabled, false);
  assert.equal(status.unavailableReason, "CONTROL_DISABLED");
  const result = await performVttRuntimeAction({
    action: "START",
    requestId: "vtt-legacy-blocked-01",
    force: false,
    actor: { id: "gm-1", displayName: "GM" },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(calls, 0);
});

test("고정 control host가 아닌 URL에는 서비스 인증값을 보내지 않는다", async () => {
  configureProduction();
  process.env.NOCHICHIM_CONTROL_URL = "https://attacker.example";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("must not fetch");
  };

  const status = await getVttRuntimeStatus();
  assert.equal(status.state, "UNREACHABLE");
  assert.equal(status.unavailableReason, "CONTROL_MISCONFIGURED");
  assert.equal(calls, 0);
});

test("상태 GET은 Cloudflare와 HMAC 헤더를 서버에서 붙이고 한 번만 재시도한다", async () => {
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

  const status = await getVttRuntimeStatus();
  assert.equal(status.state, "RUNNING");
  assert.equal(status.controlEnabled, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, "https://control.nochiijjim.com/v1/status");
  const headers = requests[1].init.headers;
  assert.equal(headers["CF-Access-Client-Id"], "cf-client-id");
  assert.equal(headers["CF-Access-Client-Secret"], "cf-client-secret");
  assert.equal(
    headers["x-nochichim-control-signature"],
    signVttControlRequest({
      secret: process.env.NOCHICHIM_CONTROL_HMAC_SECRET,
      method: "GET",
      pathname: "/v1/status",
      timestamp: headers["x-nochichim-control-timestamp"],
      nonce: headers["x-nochichim-control-nonce"],
      body: "",
    }),
  );
});

test("상태 변경 POST는 transport 실패를 자동 재시도하지 않고 UNKNOWN으로 매핑한다", async () => {
  configureProduction();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("response lost");
  };

  const result = await performVttRuntimeAction({
    action: "START",
    requestId: "vtt-action-test-01",
    force: false,
    actor: { id: "gm-1", displayName: "GM" },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 504);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "ACTION_RESULT_UNKNOWN");
});

test("controller 접속자 차단은 409와 인원수를 보존한다", async () => {
  configureProduction();
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    requestId: "vtt-action-test-02",
    code: "ACTIVE_CONNECTIONS",
    error: "접속자가 있어 종료를 차단했습니다.",
    connectedUsers: 4,
  }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });

  const result = await performVttRuntimeAction({
    action: "STOP",
    requestId: "vtt-action-test-02",
    force: false,
    actor: { id: "gm-1", displayName: "GM" },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, "ACTIVE_CONNECTIONS");
  assert.equal(result.body.connectedUsers, 4);
});

test("성공 응답은 상태를 검증하고 제어 URL을 결과에 포함하지 않는다", async () => {
  configureProduction();
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body);
    return new Response(JSON.stringify({
      ok: true,
      requestId: input.requestId,
      result: "STARTED",
      previousState: "STOPPED",
      status: controllerStatus({ connectedUsers: 0 }),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await performVttRuntimeAction({
    action: "START",
    requestId: "vtt-action-test-03",
    force: false,
    actor: { id: "gm-1", displayName: "GM" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status.state, "RUNNING");
  assert.equal(JSON.stringify(result.body).includes("control.nochiijjim.com"), false);
});
