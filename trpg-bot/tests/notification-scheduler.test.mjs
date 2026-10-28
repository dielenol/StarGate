/**
 * 알림 스케줄러 공용 팩토리 + 종류별 spec 단위 테스트 (DB·Discord 없음).
 *
 * 팩토리(`notification-scheduler.js`)는 config 를 import 하지 않지만, 종류별 spec
 * 파일은 config 를 거치므로 `applyTestEnv()` 후 동적 import 한다.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const {
  createNotificationScheduler,
  hasSessionStarted,
  recipientsWithGameMaster,
  recipientsWithoutGameMaster,
  reminderSkipReason,
} = await import("../dist/scheduler/notification-scheduler.js");
const { createCreationNotificationSpec } = await import(
  "../dist/scheduler/trpg-notification-checker.js"
);
const { createUpdateNotificationSpec, updateRecipients } = await import(
  "../dist/scheduler/trpg-update-notification-checker.js"
);
const { createCancellationNotificationSpec } = await import(
  "../dist/scheduler/trpg-cancellation-notification-checker.js"
);
const { createReminderSpec, reminderWindow } = await import(
  "../dist/scheduler/trpg-reminder-checker.js"
);

const NOW = new Date("2029-12-31T11:00:00Z");
const SESSION_ID = "65f0c0ffee0ddba11ad0beef";

function session(overrides = {}) {
  return {
    _id: { toString: () => SESSION_ID },
    guildId: "guild-1",
    title: "탐사대 1회차",
    date: "2030-01-01",
    startTime: "20:00",
    createdByDiscordId: "gm",
    createdByUsername: "GM",
    participantDiscordIds: ["gm", "p1", "p2"],
    status: "open",
    notificationSentAt: new Date("2029-12-01T00:00:00Z"),
    createdAt: new Date("2029-12-01T00:00:00Z"),
    updatedAt: new Date("2029-12-01T00:00:00Z"),
    ...overrides,
  };
}

/** 가짜 의존성 — 호출 기록을 `calls` 에 남긴다. */
function fakeDeps(overrides = {}) {
  const calls = {
    hasDelivered: [],
    record: [],
    send: [],
    alerts: [],
    taskRuns: [],
  };
  const deps = {
    baseUrl: "https://example.test",
    refetch: async () => session(),
    hasDelivered: async (input) => {
      calls.hasDelivered.push(input);
      return false;
    },
    record: async (input) => {
      calls.record.push(input);
    },
    send: async (userId, _payload, options) => {
      calls.send.push({ userId, ...options });
      return { method: "dm" };
    },
    findGuildMembers: async () => [],
    isShuttingDown: () => false,
    now: () => NOW,
    operatorAlerts: {
      notify: async (event) => {
        calls.alerts.push(event);
        return { suppressed: false, dm: "sent", channel: "sent" };
      },
    },
    recordTaskRun: (name, result) => {
      calls.taskRuns.push({ name, ...result });
    },
    ...overrides,
  };
  return { deps, calls };
}

/** 가짜 spec — 기본은 단일 회차, 참가자 전원 발송, 항상 claim/mark 성공. */
function fakeSpec(overrides = {}) {
  const calls = { claim: [], mark: [], release: [] };
  const spec = {
    name: "creation",
    logKind: "creation",
    messageKind: "creation",
    intervalMs: 60_000,
    find: async () => [session()],
    claim: async (sessionId, _session, leaseUntil) => {
      calls.claim.push({ sessionId, leaseUntil });
      return true;
    },
    mark: async (sessionId) => {
      calls.mark.push(sessionId);
      return true;
    },
    release: async (sessionId, leaseUntil) => {
      calls.release.push({ sessionId, leaseUntil });
    },
    roundKey: () => null,
    recipients: (s) => s.participantDiscordIds,
    skipReason: () => null,
    ...overrides,
  };
  return { spec, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("tick 재진입: 직전 tick 이 진행 중이면 find 를 다시 호출하지 않는다", async () => {
  const gate = deferred();
  let findCalls = 0;
  const { spec } = fakeSpec({
    find: async () => {
      findCalls += 1;
      await gate.promise;
      return [];
    },
  });
  const { deps } = fakeDeps();
  const scheduler = createNotificationScheduler(spec, deps);

  const first = scheduler.tick();
  const second = scheduler.tick();
  await Promise.resolve();
  assert.equal(findCalls, 1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(findCalls, 1);

  await scheduler.tick();
  assert.equal(findCalls, 2, "직전 tick 이 끝난 뒤에는 다시 폴링한다");
});

test("회차별 중복 가드: hasDelivered 에 roundKey 를 넘기고 이미 받은 사용자는 건너뛴다", async () => {
  const { spec, calls: specCalls } = fakeSpec({
    roundKey: (s) => `${s.date} ${s.startTime}`,
  });
  const { deps, calls } = fakeDeps({
    hasDelivered: async (input) => {
      calls.hasDelivered.push(input);
      return input.discordUserId === "p1";
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  assert.ok(
    calls.hasDelivered.every((c) => c.roundKey === "2030-01-01 20:00"),
    "모든 중복 가드 조회에 회차 키가 실린다",
  );
  assert.deepEqual(
    calls.send.map((c) => c.userId),
    ["gm", "p2"],
    "이미 같은 회차로 받은 p1 은 발송하지 않는다",
  );
  assert.ok(
    calls.record.every((r) => r.roundKey === "2030-01-01 20:00"),
    "로그 행에도 회차 키가 실린다",
  );
  assert.deepEqual(specCalls.mark, [SESSION_ID]);
  assert.deepEqual(calls.taskRuns, [
    { name: "scheduler:creation", ok: true, processed: 1 },
  ]);
});

test("GM 제외: 생성·수정·취소 spec 은 createdByDiscordId 를 수신자에서 뺀다", () => {
  const s = session();
  assert.deepEqual(recipientsWithoutGameMaster(s), ["p1", "p2"]);
  assert.deepEqual(createCreationNotificationSpec({}).recipients(s), ["p1", "p2"]);
  assert.deepEqual(createCancellationNotificationSpec({}).recipients(s), [
    "p1",
    "p2",
  ]);
  assert.deepEqual(
    updateRecipients(
      session({ updateNotificationRecipientDiscordIds: ["gm", "p1", "removed"] }),
    ),
    ["p1", "removed"],
    "수정 알림은 대기열 스냅샷(제외된 참가자 포함)에서 GM 만 뺀다",
  );
  assert.deepEqual(
    recipientsWithGameMaster(session({ participantDiscordIds: ["p1"] })),
    ["p1", "gm"],
    "리마인드는 GM 을 포함한다",
  );
});

test("GM 제외 후 수신자가 없으면 DM 없이 완료 처리한다", async () => {
  const only = session({ participantDiscordIds: ["gm"] });
  const { spec, calls: specCalls } = fakeSpec({
    find: async () => [only],
    recipients: recipientsWithoutGameMaster,
  });
  const { deps, calls } = fakeDeps({ refetch: async () => only });
  await createNotificationScheduler(spec, deps).tick();
  assert.equal(calls.send.length, 0);
  assert.deepEqual(specCalls.mark, [SESSION_ID]);
});

test("지난 세션: 시작 시각이 지났으면 생성·수정·취소 알림을 DM 없이 완료 처리한다", async () => {
  const past = session({ date: "2029-12-31", startTime: "19:00" }); // KST 19:00 = 10:00Z < NOW
  assert.equal(hasSessionStarted(past, NOW), true);
  assert.equal(hasSessionStarted(session(), NOW), false);
  assert.equal(createUpdateNotificationSpec({}).skipReason(past, NOW), "세션 시작 시각 경과");

  const { spec, calls: specCalls } = fakeSpec({
    find: async () => [past],
    skipReason: createCreationNotificationSpec({}).skipReason,
  });
  const { deps, calls } = fakeDeps({ refetch: async () => past });
  await createNotificationScheduler(spec, deps).tick();
  assert.equal(calls.send.length, 0);
  assert.deepEqual(specCalls.mark, [SESSION_ID], "DM 없이도 회차는 완료 표시한다");
});

test("종료 중: 다음 수신자로 넘어가지 않고 mark 없이 lease 를 해제한다", async () => {
  let shuttingDown = false;
  const { spec, calls: specCalls } = fakeSpec();
  const { deps, calls } = fakeDeps({
    isShuttingDown: () => shuttingDown,
    send: async (userId, _payload, options) => {
      calls.send.push({ userId, ...options });
      shuttingDown = true; // 첫 발송 직후 SIGTERM
      return { method: "dm" };
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  assert.equal(calls.send.length, 1);
  assert.equal(specCalls.mark.length, 0, "종료 중에는 완료 표시하지 않는다");
  assert.equal(specCalls.release.length, 1);
  assert.equal(specCalls.release[0].leaseUntil, specCalls.claim[0].leaseUntil);
  assert.deepEqual(calls.taskRuns, [
    { name: "scheduler:creation", ok: true, processed: 0 },
  ]);
});

test("발송 예외: failed 로 기록하고 세션당 delivery-failed 알림을 1회 보낸다", async () => {
  const { spec, calls: specCalls } = fakeSpec();
  const { deps, calls } = fakeDeps({
    send: async (userId) => {
      if (userId === "p1") throw new Error("socket hang up");
      if (userId === "p2") return { method: "failed", error: "fallback broken" };
      return { method: "dm" };
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  const failed = calls.record.filter((r) => r.deliveryMethod === "failed");
  assert.deepEqual(
    failed.map((r) => [r.discordUserId, r.error]),
    [
      ["p1", "socket hang up"],
      ["p2", "fallback broken"],
    ],
  );
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].key, "trpg-scheduler:creation:delivery-failed");
  assert.equal(calls.alerts[0].severity, "warning");
  assert.equal(calls.alerts[0].context.세션, SESSION_ID);
  assert.equal(calls.alerts[0].context.실패, 2);
  assert.equal(calls.alerts[0].context.첫오류, "socket hang up");
  assert.deepEqual(specCalls.mark, [SESSION_ID], "일부 실패여도 회차는 완료 표시한다");
});

test("tick 실패: ok:false 기록과 critical tick 알림(1h cooldown)", async () => {
  const { spec } = fakeSpec({
    find: async () => {
      throw new Error("MongoNetworkError");
    },
  });
  const { deps, calls } = fakeDeps();
  await createNotificationScheduler(spec, deps).tick();

  assert.equal(calls.taskRuns.length, 1);
  assert.equal(calls.taskRuns[0].ok, false);
  assert.match(String(calls.taskRuns[0].error), /MongoNetworkError/);
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].key, "trpg-scheduler:creation:tick");
  assert.equal(calls.alerts[0].severity, "critical");
  assert.equal(calls.alerts[0].cooldownMs, 3_600_000);
});

test("리마인드 선행조건: 생성 알림이 30분 이내에 나갔으면 DM 없이 완료 처리한다", async () => {
  const recent = session({ notificationSentAt: new Date(NOW.getTime() - 10 * 60_000) });
  assert.equal(reminderSkipReason(recent, NOW), "생성 알림 직후");
  assert.equal(reminderSkipReason(session(), NOW), null);

  const db = { marks: [] };
  const spec = createReminderSpec(
    "24h",
    {
      find: async () => [recent],
      claim: async () => true,
      mark: async (sessionId, round) => {
        db.marks.push({ sessionId, round });
        return true;
      },
      release: async () => {},
    },
    300_000,
  );
  const { deps, calls } = fakeDeps({ refetch: async () => recent });
  await createNotificationScheduler(spec, deps).tick();

  assert.equal(calls.send.length, 0);
  assert.deepEqual(db.marks, [
    {
      sessionId: SESSION_ID,
      round: { slot: "24h", date: "2030-01-01", startTime: "20:00" },
    },
  ]);
});

test("리마인드 spec: 창은 now+lead ± 2×interval, claim/mark 에 회차 스냅샷을 넘긴다", async () => {
  const w24 = reminderWindow(NOW, "24h", 300_000);
  assert.equal(w24.windowStart.getTime(), NOW.getTime() + 86_400_000 - 600_000);
  assert.equal(w24.windowEnd.getTime(), NOW.getTime() + 86_400_000 + 600_000);
  const w1 = reminderWindow(NOW, "1h", 300_000);
  assert.equal(w1.windowStart.getTime(), NOW.getTime() + 3_600_000 - 600_000);

  const db = { finds: [], claims: [] };
  const spec = createReminderSpec(
    "1h",
    {
      find: async (start, end, slot) => {
        db.finds.push({ start, end, slot });
        return [session()];
      },
      claim: async (sessionId, leaseUntil, round) => {
        db.claims.push({ sessionId, round });
        return true;
      },
      mark: async () => true,
      release: async () => {},
    },
    60_000,
  );
  assert.equal(spec.name, "reminder1h");
  assert.equal(spec.logKind, "reminder1h");
  assert.equal(spec.messageKind, "reminder1h");
  assert.equal(spec.roundKey(session()), "2030-01-01 20:00");

  const { deps, calls } = fakeDeps();
  await createNotificationScheduler(spec, deps).tick();
  assert.deepEqual(db.finds[0].slot, "1h");
  assert.deepEqual(db.claims[0].round, {
    slot: "1h",
    date: "2030-01-01",
    startTime: "20:00",
  });
  assert.deepEqual(calls.send.map((c) => c.userId), ["gm", "p1", "p2"]);
  assert.ok(calls.record.every((r) => r.kind === "reminder1h"));
});

test("선점 후 재조회 회차 불일치: lease 를 해제하고 발송하지 않는다", async () => {
  const { spec, calls: specCalls } = fakeSpec({
    roundKey: (s) => `${s.date} ${s.startTime}`,
  });
  const { deps, calls } = fakeDeps({
    refetch: async () => session({ date: "2030-01-02" }), // claim 직후 재일정
  });
  await createNotificationScheduler(spec, deps).tick();
  assert.equal(calls.send.length, 0);
  assert.equal(specCalls.mark.length, 0);
  assert.equal(specCalls.release.length, 1);
});

test("mark 회차 불일치: 자기 lease 만 해제해 다음 tick 이 최신 회차를 처리하게 한다", async () => {
  const { spec, calls: specCalls } = fakeSpec({ mark: async () => false });
  const { deps, calls } = fakeDeps();
  await createNotificationScheduler(spec, deps).tick();
  assert.equal(calls.send.length, 3);
  assert.equal(specCalls.release.length, 1);
  assert.equal(specCalls.release[0].leaseUntil, specCalls.claim[0].leaseUntil);
});

test("수정 spec: roundKey 는 queuedAt ISO, claim/mark 에 queuedAt 스냅샷을 넘긴다", async () => {
  const queuedAt = new Date("2029-12-30T00:00:00Z");
  const queued = session({
    updateNotificationQueuedAt: queuedAt,
    updateNotificationRecipientDiscordIds: ["gm", "p1", "removed"],
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  });
  const db = { claims: [], marks: [] };
  const spec = createUpdateNotificationSpec({
    find: async () => [queued],
    claim: async (sessionId, _lease, at) => {
      db.claims.push(at);
      return true;
    },
    mark: async (sessionId, at) => {
      db.marks.push(at);
      return true;
    },
    release: async () => {},
  });
  assert.equal(spec.roundKey(queued), queuedAt.toISOString());

  const { deps, calls } = fakeDeps({ refetch: async () => queued });
  await createNotificationScheduler(spec, deps).tick();
  assert.deepEqual(db.claims, [queuedAt]);
  assert.deepEqual(db.marks, [queuedAt]);
  assert.deepEqual(calls.send.map((c) => c.userId), ["p1", "removed"]);
  assert.ok(calls.hasDelivered.every((c) => c.roundKey === queuedAt.toISOString()));
});

test("길드 탈퇴자: 폴백 없이 DM 만 시도하고 실패하면 left guild 로 기록한다", async () => {
  const { spec } = fakeSpec();
  const { deps, calls } = fakeDeps({
    findGuildMembers: async (guildId, ids) => {
      assert.equal(guildId, "guild-1");
      assert.deepEqual(ids, ["gm", "p1", "p2"]);
      return [
        { discordUserId: "p1", leftAt: new Date() },
        { discordUserId: "p2", leftAt: null },
      ];
    },
    send: async (userId, _payload, options) => {
      calls.send.push({ userId, ...options });
      return userId === "p1"
        ? { method: "failed", error: "DiscordAPIError: Cannot send" }
        : { method: "dm" };
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  assert.deepEqual(calls.send, [
    { userId: "gm", allowFallback: true },
    { userId: "p1", allowFallback: false },
    { userId: "p2", allowFallback: true },
  ]);
  const p1 = calls.record.find((r) => r.discordUserId === "p1");
  assert.equal(p1.deliveryMethod, "failed");
  assert.equal(p1.error, "left guild: DiscordAPIError: Cannot send");
});

test("stop 은 인터벌을 정리하고 진행 중 tick 이 끝날 때까지 기다린다", async () => {
  const gate = deferred();
  const { spec, calls: specCalls } = fakeSpec({
    intervalMs: 1_000_000,
    find: async () => {
      await gate.promise;
      return [session()];
    },
  });
  const { deps, calls } = fakeDeps();
  const stop = createNotificationScheduler(spec, deps).start();

  let stopped = false;
  const stopping = stop().then(() => {
    stopped = true;
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(stopped, false, "tick 이 진행 중이면 stop 은 아직 resolve 하지 않는다");

  gate.resolve();
  await stopping;
  assert.equal(stopped, true);
  assert.deepEqual(specCalls.mark, [SESSION_ID], "진행 중이던 tick 은 끝까지 처리된다");
  assert.equal(calls.taskRuns.length, 1);
});

test("세션 처리 예외: claim 뒤 예외면 lease 를 해제하고 ok:false + session-error 알림 1회", async () => {
  const { spec, calls: specCalls } = fakeSpec();
  const { deps, calls } = fakeDeps({
    refetch: async () => {
      throw new Error("MongoServerSelectionError");
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  assert.equal(specCalls.claim.length, 1);
  assert.equal(specCalls.release.length, 1, "선점한 채 빠지지 않도록 lease 를 해제한다");
  assert.equal(specCalls.release[0].leaseUntil, specCalls.claim[0].leaseUntil);
  assert.equal(specCalls.mark.length, 0);
  assert.equal(calls.taskRuns.length, 1);
  assert.equal(calls.taskRuns[0].ok, false);
  assert.equal(calls.taskRuns[0].processed, 0);
  assert.match(String(calls.taskRuns[0].error), /MongoServerSelectionError/);
  assert.equal(calls.alerts.length, 1);
  assert.equal(calls.alerts[0].key, "trpg-scheduler:creation:session-error");
  assert.equal(calls.alerts[0].severity, "warning");
  assert.equal(calls.alerts[0].context.실패세션, 1);
  assert.match(String(calls.alerts[0].context.첫오류), /MongoServerSelectionError/);
  assert.equal(calls.alerts[0].cooldownMs, undefined, "기본 cooldown");
});

test("세션 처리 예외: release 자체가 실패해도 예외를 그대로 올리고 다음 세션은 계속한다", async () => {
  const second = session({ _id: { toString: () => "65f0c0ffee0ddba11ad0bee0" } });
  let refetches = 0;
  const { spec, calls: specCalls } = fakeSpec({
    find: async () => [session(), second],
    release: async () => {
      throw new Error("release failed");
    },
  });
  const { deps, calls } = fakeDeps({
    refetch: async () => {
      refetches += 1;
      if (refetches === 1) throw new Error("boom");
      return second;
    },
  });
  await createNotificationScheduler(spec, deps).tick();
  assert.deepEqual(specCalls.mark, ["65f0c0ffee0ddba11ad0bee0"], "두 번째 세션은 정상 처리");
  assert.equal(calls.taskRuns[0].ok, false);
  assert.equal(calls.taskRuns[0].processed, 1);
  assert.equal(calls.alerts.length, 1);
});

test("예상된 실패(탈퇴자 DM 실패·10013)는 로그에는 failed 로 남기고 delivery-failed 알림에서는 뺀다", async () => {
  const { spec, calls: specCalls } = fakeSpec();
  const { deps, calls } = fakeDeps({
    findGuildMembers: async () => [{ discordUserId: "p1", leftAt: new Date() }],
    send: async (userId) => {
      if (userId === "p1") return { method: "failed", error: "Cannot send", code: 50007 };
      if (userId === "p2") return { method: "failed", error: "Unknown User", code: 10013 };
      return { method: "dm" };
    },
  });
  await createNotificationScheduler(spec, deps).tick();

  const failed = calls.record.filter((r) => r.deliveryMethod === "failed");
  assert.deepEqual(failed.map((r) => r.discordUserId), ["p1", "p2"], "시도 로그에는 남는다");
  assert.match(failed[0].error, /^left guild: /);
  assert.equal(calls.alerts.length, 0, "예상된 실패만 있으면 운영 경고를 보내지 않는다");
  assert.deepEqual(specCalls.mark, [SESSION_ID]);

  // 예상 밖 실패가 섞이면 그것만 센다.
  const mixed = fakeDeps({
    findGuildMembers: async () => [{ discordUserId: "p1", leftAt: new Date() }],
    send: async (userId) =>
      userId === "gm"
        ? { method: "failed", error: "fallback channel broken" }
        : { method: "failed", error: "Cannot send", code: 50007 },
  });
  await createNotificationScheduler(fakeSpec().spec, mixed.deps).tick();
  assert.equal(mixed.calls.alerts.length, 1);
  assert.equal(mixed.calls.alerts[0].key, "trpg-scheduler:creation:delivery-failed");
  assert.equal(mixed.calls.alerts[0].context.실패, 2, "gm(폴백 고장) + p2(50007, 탈퇴자 아님)");
  assert.equal(mixed.calls.alerts[0].context.첫오류, "fallback channel broken");
});

test("종료 중이면 tick 은 조회 전에 돌아가고 기록·알림을 남기지 않는다", async () => {
  let findCalls = 0;
  const { spec } = fakeSpec({
    find: async () => {
      findCalls += 1;
      return [];
    },
  });
  const { deps, calls } = fakeDeps({ isShuttingDown: () => true });
  await createNotificationScheduler(spec, deps).tick();
  assert.equal(findCalls, 0);
  assert.equal(calls.taskRuns.length, 0);
  assert.equal(calls.alerts.length, 0);
});

/* ── 부분 발송 뒤 종료 → 후속 수정·취소 (validator 재현 하네스) ──
 * shared-db 의 planTrpgSessionUpdate / planTrpgSessionCancel / isCreationNotificationPending 과
 * 봇 spec 을 실제로 쓰고, DB 는 CRUD 필터를 옮긴 메모리 구현. 생성 DM 이 일부에게만
 * 나간 뒤 종료돼도 선점 흔적(notificationClaimedAt)으로 "안내받은 세션" 이 되어
 * 이미 받은 참가자가 후속 변경을 받아야 한다.
 */
const {
  isCreationNotificationPending,
  planTrpgSessionCancel,
  planTrpgSessionUpdate,
} = await import("@stargate/shared-db");

const PARTIAL_NOW = new Date("2030-01-10T12:00:00Z");

function partialDoc(over = {}) {
  return {
    ...session({
      title: "A",
      date: "2030-02-01",
      participantDiscordIds: ["gm", "p1", "p2"],
      notificationSentAt: null,
      notificationClaimedAt: null,
      notificationClaimLeaseUntil: null,
      updateNotificationQueuedAt: null,
      updateNotificationSentAt: null,
      updateNotificationClaimLeaseUntil: null,
      updateNotificationBaseline: null,
      updateNotificationRecipientDiscordIds: null,
      updateNotificationChanges: null,
      cancellationNotificationQueuedAt: null,
      cancellationNotificationSentAt: null,
      cancellationNotificationClaimLeaseUntil: null,
    }),
    ...over,
  };
}

const leaseInactive = (lease, now) => lease == null || lease <= now;

function partialHarness(doc) {
  const log = [];
  let shuttingDown = false;
  let shutdownAfterUser = null;
  const { deps } = fakeDeps({
    refetch: async () => ({ ...doc }),
    hasDelivered: async ({ discordUserId, kind, roundKey }) =>
      log.some(
        (r) =>
          r.userId === discordUserId &&
          r.kind === kind &&
          ["dm", "fallback"].includes(r.method) &&
          (roundKey == null || r.roundKey === roundKey),
      ),
    record: async (r) =>
      log.push({ userId: r.discordUserId, kind: r.kind, roundKey: r.roundKey, method: r.deliveryMethod }),
    send: async (userId) => {
      if (userId === shutdownAfterUser) shuttingDown = true; // SIGTERM 이 이 사용자 발송 직후 도착
      return { method: "dm" };
    },
    isShuttingDown: () => shuttingDown,
    now: () => PARTIAL_NOW,
  });
  const creationDb = {
    find: async () =>
      doc.status === "open" && doc.notificationSentAt == null && leaseInactive(doc.notificationClaimLeaseUntil, PARTIAL_NOW)
        ? [{ ...doc }]
        : [],
    claim: async (_id, leaseUntil) => {
      if (doc.status === "open" && doc.notificationSentAt == null && leaseInactive(doc.notificationClaimLeaseUntil, PARTIAL_NOW)) {
        doc.notificationClaimedAt = PARTIAL_NOW;
        doc.notificationClaimLeaseUntil = leaseUntil;
        return true;
      }
      return false;
    },
    mark: async () => {
      doc.notificationSentAt = PARTIAL_NOW;
      doc.notificationClaimLeaseUntil = null;
      return true;
    },
    release: async (_id, leaseUntil) => {
      if (doc.notificationClaimLeaseUntil?.getTime() === leaseUntil.getTime()) doc.notificationClaimLeaseUntil = null;
    },
  };
  const updateDb = {
    // 수정 알림은 생성 알림이 완료된(notificationSentAt != null) 세션만 본다.
    find: async () =>
      doc.status === "open" &&
      doc.updateNotificationQueuedAt &&
      doc.updateNotificationSentAt == null &&
      doc.notificationSentAt != null &&
      leaseInactive(doc.updateNotificationClaimLeaseUntil, PARTIAL_NOW)
        ? [{ ...doc }]
        : [],
    claim: async (_id, leaseUntil, queuedAt) => {
      if (
        doc.updateNotificationQueuedAt?.getTime() === queuedAt.getTime() &&
        doc.updateNotificationSentAt == null &&
        doc.notificationSentAt != null &&
        leaseInactive(doc.updateNotificationClaimLeaseUntil, PARTIAL_NOW)
      ) {
        doc.updateNotificationClaimLeaseUntil = leaseUntil;
        return true;
      }
      return false;
    },
    mark: async (_id, queuedAt) => {
      if (doc.updateNotificationQueuedAt?.getTime() !== queuedAt.getTime()) return false;
      doc.updateNotificationSentAt = PARTIAL_NOW;
      doc.updateNotificationClaimLeaseUntil = null;
      doc.updateNotificationBaseline = null;
      return true;
    },
    release: async (_id, leaseUntil) => {
      if (doc.updateNotificationClaimLeaseUntil?.getTime() === leaseUntil.getTime()) doc.updateNotificationClaimLeaseUntil = null;
    },
  };
  const cancellationDb = {
    find: async () =>
      doc.status === "cancelled" &&
      doc.cancellationNotificationQueuedAt &&
      doc.cancellationNotificationSentAt == null &&
      leaseInactive(doc.cancellationNotificationClaimLeaseUntil, PARTIAL_NOW) &&
      leaseInactive(doc.notificationClaimLeaseUntil, PARTIAL_NOW)
        ? [{ ...doc }]
        : [],
    claim: async (_id, leaseUntil) => {
      if (
        doc.status === "cancelled" &&
        doc.cancellationNotificationQueuedAt &&
        doc.cancellationNotificationSentAt == null &&
        leaseInactive(doc.cancellationNotificationClaimLeaseUntil, PARTIAL_NOW) &&
        leaseInactive(doc.notificationClaimLeaseUntil, PARTIAL_NOW)
      ) {
        doc.cancellationNotificationClaimLeaseUntil = leaseUntil;
        return true;
      }
      return false;
    },
    mark: async () => {
      doc.cancellationNotificationSentAt = PARTIAL_NOW;
      doc.cancellationNotificationClaimLeaseUntil = null;
      return true;
    },
    release: async (_id, leaseUntil) => {
      if (doc.cancellationNotificationClaimLeaseUntil?.getTime() === leaseUntil.getTime()) {
        doc.cancellationNotificationClaimLeaseUntil = null;
      }
    },
  };
  return {
    log,
    shutdownAfter(userId) {
      shutdownAfterUser = userId;
    },
    restart() {
      shuttingDown = false;
      shutdownAfterUser = null;
    },
    creation: () => createNotificationScheduler(createCreationNotificationSpec(creationDb), deps),
    update: () => createNotificationScheduler(createUpdateNotificationSpec(updateDb), deps),
    cancellation: () =>
      createNotificationScheduler(createCancellationNotificationSpec(cancellationDb), deps),
    probeUpdateClaim: (queuedAt) =>
      updateDb.claim(SESSION_ID, new Date(PARTIAL_NOW.getTime() + 300_000), queuedAt),
    applyUpdate(patch, now = PARTIAL_NOW) {
      const plan = planTrpgSessionUpdate({ ...doc }, patch, now);
      Object.assign(doc, plan.set);
      return plan;
    },
    applyCancel(now = PARTIAL_NOW) {
      const mode = isCreationNotificationPending(doc, now) ? "skip" : "queue";
      Object.assign(doc, planTrpgSessionCancel(mode, now).set);
      return mode;
    },
  };
}

test("부분 발송 뒤 종료 → 취소: 선점 흔적으로 취소 알림이 쌓이고 이미 받은 p1 도 취소 DM 을 받는다", async () => {
  const doc = partialDoc();
  const h = partialHarness(doc);
  h.shutdownAfter("p1");
  await h.creation().tick();
  assert.deepEqual(h.log.map((r) => r.userId), ["p1"], "p1 만 생성 DM 수신");
  assert.equal(doc.notificationSentAt, null, "mark 없이");
  assert.equal(doc.notificationClaimLeaseUntil, null, "lease 해제");
  assert.ok(doc.notificationClaimedAt instanceof Date, "선점 흔적은 남는다");

  assert.equal(h.applyCancel(), "queue");
  assert.ok(doc.cancellationNotificationQueuedAt instanceof Date);

  h.restart();
  await h.cancellation().tick();
  const cancelled = h.log.filter((r) => r.kind === "cancellation").map((r) => r.userId);
  assert.deepEqual(cancelled, ["p1", "p2"], "p1 은 세션이 취소됐음을 안다");
  assert.ok(doc.cancellationNotificationSentAt instanceof Date);
});

test("부분 발송 뒤 종료 → 일시 변경: 수정 알림이 쌓이고 재기동 후 p1·p2 모두 받는다", async () => {
  const doc = partialDoc();
  const h = partialHarness(doc);
  h.shutdownAfter("p1");
  await h.creation().tick();

  const plan = h.applyUpdate({ date: "2030-02-08" });
  assert.equal(plan.queued, true, "일부가 안내받은 세션이므로 수정 알림을 쌓는다");

  h.restart();
  await h.creation().tick();
  assert.deepEqual(
    h.log.filter((r) => r.kind === "creation").map((r) => r.userId),
    ["p1", "p2"],
    "재기동 후 생성 DM 은 p2 만 추가로 받는다",
  );
  await h.update().tick();
  assert.deepEqual(
    h.log.filter((r) => r.kind === "update").map((r) => r.userId),
    ["p1", "p2"],
    "p1 도 2/8 변경을 받는다",
  );
});

test("생성 부분 발송 → abort → 재기동 시 생성·수정 동시 tick: p2 는 생성 DM 을 수정 DM 보다 먼저 받는다", async () => {
  const doc = partialDoc();
  const h = partialHarness(doc);
  h.shutdownAfter("p1");
  await h.creation().tick();
  const plan = h.applyUpdate({ date: "2030-02-08" });
  assert.equal(plan.queued, true);
  const queuedAt = doc.updateNotificationQueuedAt;

  assert.equal(
    await h.probeUpdateClaim(queuedAt),
    false,
    "생성 알림이 끝나기 전에는 수정 claim 이 false",
  );
  assert.equal(doc.updateNotificationClaimLeaseUntil, null);

  h.restart();
  await Promise.all([h.creation().tick(), h.update().tick()]);
  assert.deepEqual(
    h.log.map((r) => `${r.kind}:${r.userId}`),
    ["creation:p1", "creation:p2"],
    "같은 tick 에서는 생성만 나가고 수정은 아직 나가지 않는다",
  );
  assert.ok(doc.notificationSentAt instanceof Date);

  await h.update().tick();
  assert.deepEqual(
    h.log.map((r) => `${r.kind}:${r.userId}`),
    ["creation:p1", "creation:p2", "update:p1", "update:p2"],
    "생성 완료 뒤 다음 tick 에서 수정 DM 이 나간다",
  );
});

test("수정 DM 일부 발송 뒤 종료 → 추가 수정: 회차가 재발급되어 p1 도 누적 변경을 다시 받는다", async () => {
  const doc = partialDoc({
    notificationSentAt: new Date(PARTIAL_NOW.getTime() - 86_400_000),
    notificationClaimedAt: new Date(PARTIAL_NOW.getTime() - 86_400_000),
  });
  const h = partialHarness(doc);
  const q1 = new Date(PARTIAL_NOW.getTime() - 120_000);
  h.applyUpdate({ date: "2030-02-08" }, q1);
  const round1 = doc.updateNotificationQueuedAt.toISOString();

  h.shutdownAfter("p1");
  await h.update().tick();
  assert.deepEqual(h.log.map((r) => r.userId), ["p1"]);
  assert.equal(doc.updateNotificationClaimLeaseUntil, null);

  const plan = h.applyUpdate({ title: "A (장소 변경)" });
  assert.equal(plan.queued, true);
  assert.notEqual(doc.updateNotificationQueuedAt.toISOString(), round1, "회차 재발급");
  assert.deepEqual(doc.updateNotificationChanges, [
    "세션 제목 변경: A → A (장소 변경)",
    "일시 변경: 2030-02-01 20:00 → 2030-02-08 20:00",
  ]);

  h.restart();
  await h.update().tick();
  const second = h.log.filter((r) => r.roundKey === doc.updateNotificationQueuedAt.toISOString());
  assert.deepEqual(second.map((r) => r.userId), ["p1", "p2"], "p1 은 제목 변경을 포함한 누적 요약을 받는다");
});
