import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const calls = [];
globalThis.__vttHostAuditTestCalls = calls;
const existingDedupeKeys = new Set();
globalThis.__vttHostAuditExistingDedupeKeys = existingDedupeKeys;
const ackCalls = [];
globalThis.__vttHostAuditAckCalls = ackCalls;
const auditFailures = new Set();
globalThis.__vttHostAuditFailures = auditFailures;
globalThis.__vttHostAuditAckFailure = false;

function moduleUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/notifications/gm-admin-audit") {
      return {
        url: moduleUrl(`
          export async function findMissingGmAdminAuditDedupeKeys(keys) {
            const existing = globalThis.__vttHostAuditExistingDedupeKeys;
            return keys.filter(key => !existing.has(key));
          }
          export async function scheduleGmAdminAudit(payload, options) {
            if (globalThis.__vttHostAuditFailures.has(options.dedupeKey)) {
              throw new Error("AUDIT_FAILED");
            }
            globalThis.__vttHostAuditTestCalls.push({ payload, options });
          }
        `),
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/vtt-runtime/host-control-client") {
      return {
        url: moduleUrl(`
          export async function acknowledgeVttHostAudits(requestIds) {
            globalThis.__vttHostAuditAckCalls.push([...requestIds]);
            if (globalThis.__vttHostAuditAckFailure) {
              throw new Error("ACK_FAILED");
            }
          }
        `),
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { reconcileCompletedVttHostAudit } = await import(
  `../host-audit.ts?test=${Date.now()}`
);

function status(lastAction, transition = null) {
  return {
    state: transition ? "SWITCHING" : "RUNNING",
    activeHost: "VPS",
    desiredHost: "VPS",
    lastWriterHost: "VPS",
    generation: 5,
    manifest: null,
    routeHost: "VPS",
    transition,
    hosts: {},
    lastAction,
    completedActions: lastAction ? [lastAction] : [],
    pendingAuditCount: lastAction ? 1 : 0,
    auditBacklogBlocked: false,
    controlEnabled: true,
  };
}

function completedAction(overrides = {}) {
  return {
    requestId: "vtt-host-completed-01",
    action: "SWITCH_HOST",
    sourceHost: "HOME",
    targetHost: "VPS",
    force: false,
    actor: { id: "gm-1", displayName: "테스트 GM" },
    requestedAt: 1_787_321_400_000,
    completedAt: 1_787_321_460_000,
    result: "SWITCHED",
    generation: 5,
    sourceRevision: "abc123",
    code: null,
    ...overrides,
  };
}

test.beforeEach(() => {
  calls.splice(0);
  ackCalls.splice(0);
  existingDedupeKeys.clear();
  auditFailures.clear();
  globalThis.__vttHostAuditAckFailure = false;
});

test("완료된 성공 전환은 request ID dedupe로 durable GM audit을 적재한다", async () => {
  const result = await reconcileCompletedVttHostAudit(status(completedAction()));
  assert.deepEqual(result, {
    status: "QUEUED",
    requestIds: ["vtt-host-completed-01"],
  });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].options.dedupeKey,
    "vtt-host-completed:vtt-host-completed-01",
  );
  assert.equal(calls[0].payload.details[1].value, "HOME");
  assert.equal(calls[0].payload.details[2].value, "VPS");
  assert.equal(calls[0].payload.details[3].value, "5");
  assert.equal(calls[0].payload.details[4].value, "abc123");
  assert.deepEqual(ackCalls, [["vtt-host-completed-01"]]);
});

test("최근 완료 receipt 여러 건을 각각의 generation과 request ID로 모두 조정한다", async () => {
  const first = completedAction();
  const second = completedAction({
    requestId: "vtt-host-completed-02",
    sourceHost: "VPS",
    targetHost: "HOME",
    generation: 6,
    sourceRevision: "def456",
  });
  const result = await reconcileCompletedVttHostAudit({
    ...status(second),
    completedActions: [first, second],
  });
  assert.deepEqual(result, {
    status: "QUEUED",
    requestIds: ["vtt-host-completed-01", "vtt-host-completed-02"],
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(call => call.options.dedupeKey),
    [
      "vtt-host-completed:vtt-host-completed-01",
      "vtt-host-completed:vtt-host-completed-02",
    ],
  );
  assert.deepEqual(
    calls.map(call => call.payload.details[3].value),
    ["5", "6"],
  );
  assert.deepEqual(ackCalls, [[
    "vtt-host-completed-01",
    "vtt-host-completed-02",
  ]]);
});

test("이미 durable outbox에 있는 완료 request ID는 다시 적재하지 않는다", async () => {
  existingDedupeKeys.add("vtt-host-completed:vtt-host-completed-01");
  const result = await reconcileCompletedVttHostAudit(status(completedAction()));
  assert.deepEqual(result, {
    status: "ALREADY_RECORDED",
    requestIds: ["vtt-host-completed-01"],
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(ackCalls, [["vtt-host-completed-01"]]);
});

test("새 전환 중에도 이전 완료를 회수하고 성공 완료가 아니면 건너뛴다", async () => {
  const transition = {
    requestId: "vtt-host-switching-01",
    phase: "TRANSFERRING",
  };
  assert.deepEqual(
    await reconcileCompletedVttHostAudit(status(completedAction(), transition)),
    { status: "QUEUED", requestIds: ["vtt-host-completed-01"] },
  );
  assert.equal(calls.length, 1);
  calls.splice(0);
  assert.deepEqual(
    await reconcileCompletedVttHostAudit(status(completedAction({
      result: "RECOVERY_REQUIRED",
    }))),
    { status: "NO_COMPLETED_ACTION" },
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(ackCalls, [["vtt-host-completed-01"]]);
});

test("outbox 적재 하나라도 실패하면 controller ACK를 보내지 않는다", async () => {
  const first = completedAction();
  const second = completedAction({ requestId: "vtt-host-completed-02" });
  auditFailures.add("vtt-host-completed:vtt-host-completed-02");
  await assert.rejects(
    reconcileCompletedVttHostAudit({
      ...status(second),
      completedActions: [first, second],
      pendingAuditCount: 2,
    }),
    /AUDIT_FAILED/,
  );
  assert.deepEqual(ackCalls, []);
});

test("ACK 실패는 성공으로 숨기지 않고 다음 조정에서 다시 시도할 수 있게 한다", async () => {
  existingDedupeKeys.add("vtt-host-completed:vtt-host-completed-01");
  globalThis.__vttHostAuditAckFailure = true;
  await assert.rejects(
    reconcileCompletedVttHostAudit(status(completedAction())),
    /ACK_FAILED/,
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(ackCalls, [["vtt-host-completed-01"]]);
});

test("lastAction은 pending 목록에 없으면 ACK나 감사 대상으로 재추정하지 않는다", async () => {
  const result = await reconcileCompletedVttHostAudit({
    ...status(completedAction()),
    completedActions: [],
    pendingAuditCount: 0,
  });
  assert.deepEqual(result, { status: "NO_COMPLETED_ACTION" });
  assert.equal(calls.length, 0);
  assert.equal(ackCalls.length, 0);
});
