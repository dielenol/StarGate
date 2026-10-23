/**
 * trpg_sessions 알림 상태 전이 순수 로직 테스트 (DB 불필요).
 *
 *   - baseline diff / 변경 요약 문구 / 수신자 합집합
 *   - 연속 수정 병합과 되돌림(대기 해제) 판정
 *   - 생성 DM 전 수정·취소 시 대기열 미적재 + 원자적 guard
 *   - 재일정 판정은 값이 실제로 바뀔 때만, 활성 lease 는 지우지 않음
 *
 * 실행: `cd packages/shared-db && pnpm build && node --test src/crud/__tests__/trpg-session-notification-state.test.mjs`
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTrpgSessionPatch,
  buildUpdateNotificationState,
  hasActiveLease,
  isCreationNotificationPending,
  planTrpgSessionCancel,
  planTrpgSessionUpdate,
  toUpdateNotificationBaseline,
} from "../../../dist/index.js";

const NOW = new Date("2030-01-10T12:00:00Z");
const PAST = new Date(NOW.getTime() - 60_000);
const FUTURE = new Date(NOW.getTime() + 60_000);

function session(overrides = {}) {
  return {
    guildId: "g",
    title: "A",
    date: "2030-02-01",
    startTime: "20:00",
    createdByDiscordId: "gm",
    createdByUsername: "GM",
    participantDiscordIds: ["gm", "p1"],
    status: "open",
    notificationSentAt: PAST,
    notificationClaimedAt: PAST,
    notificationClaimLeaseUntil: null,
    reminderSentAt: null,
    reminderClaimLeaseUntil: null,
    reminder1hSentAt: null,
    reminder1hClaimLeaseUntil: null,
    updateNotificationQueuedAt: null,
    updateNotificationSentAt: null,
    updateNotificationClaimLeaseUntil: null,
    updateNotificationRecipientDiscordIds: null,
    updateNotificationChanges: null,
    updateNotificationBaseline: null,
    createdAt: PAST,
    updatedAt: PAST,
    ...overrides,
  };
}

test("buildUpdateNotificationState: 제목·일시·참가자 변경 문구와 수신자 합집합", () => {
  const baseline = toUpdateNotificationBaseline(session());
  const next = applyTrpgSessionPatch(baseline, {
    title: "B",
    startTime: "21:00",
    participantDiscordIds: ["gm", "p2", "p3"],
  });
  const state = buildUpdateNotificationState(baseline, next);
  assert.deepEqual(state.changes, [
    "세션 제목 변경: A → B",
    "일시 변경: 2030-02-01 20:00 → 2030-02-01 21:00",
    "참가 대상 변경: 추가 2명, 제외 1명",
  ]);
  assert.deepEqual(state.recipients, ["gm", "p1", "p2", "p3"]);
});

test("buildUpdateNotificationState: 같은 상태면 변경이 비고 순서만 다른 참가자는 변경이 아니다", () => {
  const baseline = toUpdateNotificationBaseline(session());
  const same = { ...baseline, participantDiscordIds: ["p1", "gm"] };
  const state = buildUpdateNotificationState(baseline, same);
  assert.deepEqual(state.changes, []);
});

test("hasActiveLease / isCreationNotificationPending", () => {
  assert.equal(hasActiveLease(null, NOW), false);
  assert.equal(hasActiveLease(undefined, NOW), false);
  assert.equal(hasActiveLease(PAST, NOW), false);
  assert.equal(hasActiveLease(NOW, NOW), false, "경계(= now)는 비활성");
  assert.equal(hasActiveLease(FUTURE, NOW), true);
  assert.equal(
    isCreationNotificationPending(
      { notificationSentAt: null, notificationClaimedAt: null, notificationClaimLeaseUntil: null },
      NOW,
    ),
    true,
  );
  assert.equal(
    isCreationNotificationPending(
      { notificationSentAt: null, notificationClaimLeaseUntil: null },
      NOW,
    ),
    true,
    "배포 전 문서(claimedAt 필드 없음)는 선점 이력 없음으로 본다",
  );
  assert.equal(
    isCreationNotificationPending(
      { notificationSentAt: null, notificationClaimedAt: null, notificationClaimLeaseUntil: FUTURE },
      NOW,
    ),
    false,
    "생성 lease 가 활성이면 발송 중으로 본다",
  );
  assert.equal(
    isCreationNotificationPending(
      { notificationSentAt: null, notificationClaimedAt: PAST, notificationClaimLeaseUntil: null },
      NOW,
    ),
    false,
    "선점 흔적이 있으면 일부가 안내받았을 수 있는 세션으로 본다",
  );
  assert.equal(
    isCreationNotificationPending(
      { notificationSentAt: PAST, notificationClaimedAt: PAST, notificationClaimLeaseUntil: null },
      NOW,
    ),
    false,
  );
});

test("생성 DM 선점 마커: claimedAt 있는 문서는 수정 queue·취소 queue 모드, 없으면 skip", () => {
  const aborted = session({
    notificationSentAt: null,
    notificationClaimedAt: PAST,
    notificationClaimLeaseUntil: null, // 부분 발송 뒤 release 됨
  });
  const plan = planTrpgSessionUpdate(aborted, { title: "B" }, NOW);
  assert.equal(plan.queued, true, "일부 수신자가 받았을 수 있으므로 수정 알림을 쌓는다");
  assert.equal(plan.set.updateNotificationQueuedAt, NOW);
  assert.equal(isCreationNotificationPending(aborted, NOW) ? "skip" : "queue", "queue");

  const untouched = session({
    notificationSentAt: null,
    notificationClaimedAt: null,
    notificationClaimLeaseUntil: null,
  });
  assert.equal(planTrpgSessionUpdate(untouched, { title: "B" }, NOW).queued, false);
  assert.equal(isCreationNotificationPending(untouched, NOW) ? "skip" : "queue", "skip");
});

test("plan: 대기 없음 → 현재 문서를 baseline 으로 새 회차를 쌓는다", () => {
  const existing = session();
  const plan = planTrpgSessionUpdate(existing, { title: "B" }, NOW);
  assert.equal(plan.queued, true);
  assert.equal(plan.set.title, "B");
  assert.equal(plan.set.updateNotificationQueuedAt, NOW);
  assert.equal(plan.set.updateNotificationSentAt, null);
  assert.equal(plan.set.updateNotificationClaimLeaseUntil, null);
  assert.deepEqual(plan.set.updateNotificationBaseline, {
    title: "A",
    date: "2030-02-01",
    startTime: "20:00",
    participantDiscordIds: ["gm", "p1"],
  });
  assert.deepEqual(plan.set.updateNotificationChanges, ["세션 제목 변경: A → B"]);
  assert.deepEqual(plan.set.updateNotificationRecipientDiscordIds, ["gm", "p1"]);
  assert.deepEqual(plan.guard, {
    updateNotificationQueuedAt: null,
    updateNotificationSentAt: null,
    updateNotificationClaimLeaseUntil: null,
  });
  assert.equal("reminderSentAt" in plan.set, false, "일시가 안 바뀌면 리마인드를 건드리지 않는다");
});

test("plan: 발송 완료된 회차 뒤의 수정은 guard 에 sentAt 일치 조건을 실어 ABA 를 거른다", () => {
  const sentAt = new Date(NOW.getTime() - 10_000);
  const existing = session({
    title: "B",
    updateNotificationQueuedAt: PAST,
    updateNotificationSentAt: sentAt,
    updateNotificationBaseline: null,
  });
  const plan = planTrpgSessionUpdate(existing, { title: "C" }, NOW);
  assert.equal(plan.queued, true);
  assert.deepEqual(plan.guard, {
    updateNotificationQueuedAt: PAST,
    updateNotificationSentAt: sentAt,
    updateNotificationClaimLeaseUntil: null,
  });
  assert.equal(plan.set.updateNotificationSentAt, null);
  assert.equal(plan.set.updateNotificationBaseline.title, "B", "발송된 회차 뒤에는 현재 문서가 baseline");
});

test("plan: 변경이 없는 패치는 대기열을 쌓지 않는다", () => {
  const plan = planTrpgSessionUpdate(session(), { title: "A" }, NOW);
  assert.equal(plan.queued, false);
  assert.equal("updateNotificationQueuedAt" in plan.set, false);
});

test("plan: 대기 중(미발송, lease 비활성) → 누적 baseline 대비로 병합하고 회차를 새로 발급한다", () => {
  const queuedAt = new Date(NOW.getTime() - 30_000);
  const existing = session({
    title: "B",
    updateNotificationQueuedAt: queuedAt,
    updateNotificationClaimLeaseUntil: PAST, // 만료된 lease (부분 발송 뒤 release 포함)
    updateNotificationBaseline: {
      title: "A",
      date: "2030-02-01",
      startTime: "20:00",
      participantDiscordIds: ["gm", "p1"],
    },
    updateNotificationRecipientDiscordIds: ["gm", "p1"],
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  });
  const plan = planTrpgSessionUpdate(
    existing,
    { title: "C", participantDiscordIds: ["gm", "p2"] },
    NOW,
  );
  assert.equal(plan.queued, true);
  assert.equal(
    plan.set.updateNotificationQueuedAt,
    NOW,
    "회차를 재발급해 부분 수신자도 누적 요약을 다시 받는다",
  );
  assert.equal(plan.set.updateNotificationSentAt, null);
  assert.deepEqual(plan.set.updateNotificationChanges, [
    "세션 제목 변경: A → C",
    "참가 대상 변경: 추가 1명, 제외 1명",
  ]);
  assert.deepEqual(plan.set.updateNotificationRecipientDiscordIds, ["gm", "p1", "p2"]);
  assert.deepEqual(plan.set.updateNotificationBaseline, existing.updateNotificationBaseline);
  assert.deepEqual(plan.guard, {
    updateNotificationQueuedAt: queuedAt,
    updateNotificationSentAt: null,
    updateNotificationClaimLeaseUntil: PAST,
  });
});

test("plan: lease 활성 + 미발송 대기 회차에서 연속 2회 수정 → 누적 baseline 대비 두 변경이 모두 남는다", () => {
  const baseline = {
    title: "A",
    date: "2030-02-01",
    startTime: "20:00",
    participantDiscordIds: ["gm", "p1"],
  };
  // R1(A→B) 발송 중(lease 활성)에 일시 변경.
  const afterTitle = session({
    title: "B",
    updateNotificationQueuedAt: PAST,
    updateNotificationClaimLeaseUntil: FUTURE,
    updateNotificationBaseline: baseline,
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  });
  const r2 = planTrpgSessionUpdate(afterTitle, { date: "2030-02-02" }, NOW);
  assert.equal(r2.queued, true);
  assert.equal(r2.set.updateNotificationQueuedAt, NOW);
  assert.deepEqual(r2.set.updateNotificationBaseline, baseline, "누적 baseline 유지");
  assert.deepEqual(r2.set.updateNotificationChanges, [
    "세션 제목 변경: A → B",
    "일시 변경: 2030-02-01 20:00 → 2030-02-02 20:00",
  ]);
  assert.equal("updateNotificationClaimLeaseUntil" in r2.set, false, "활성 lease 를 지우지 않는다");

  // 이어서 제목 B→C (R2 아직 미발송, lease 여전히 활성).
  const afterDate = session({
    ...afterTitle,
    date: "2030-02-02",
    updateNotificationQueuedAt: NOW,
    updateNotificationBaseline: r2.set.updateNotificationBaseline,
    updateNotificationChanges: r2.set.updateNotificationChanges,
  });
  const later = new Date(NOW.getTime() + 1_000);
  const r3 = planTrpgSessionUpdate(afterDate, { title: "C" }, later);
  assert.equal(r3.queued, true);
  assert.equal(r3.set.updateNotificationQueuedAt, later);
  assert.deepEqual(r3.set.updateNotificationChanges, [
    "세션 제목 변경: A → C",
    "일시 변경: 2030-02-01 20:00 → 2030-02-02 20:00",
  ], "일시 변경 안내가 사라지지 않는다");
});

test("plan: 되돌림 — lease 비활성이면 대기를 해제하고, lease 활성이면 현재 문서를 baseline 으로 정정 회차", () => {
  const baseline = {
    title: "A",
    date: "2030-02-01",
    startTime: "20:00",
    participantDiscordIds: ["gm", "p1"],
  };
  const pendingFields = {
    title: "B",
    updateNotificationQueuedAt: PAST,
    updateNotificationBaseline: baseline,
    updateNotificationRecipientDiscordIds: ["gm", "p1"],
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  };

  const released = planTrpgSessionUpdate(
    session({ ...pendingFields, updateNotificationClaimLeaseUntil: PAST }),
    { title: "A" },
    NOW,
  );
  assert.equal(released.queued, false);
  assert.equal(released.set.updateNotificationQueuedAt, null);
  assert.equal(released.set.updateNotificationBaseline, null);
  assert.equal(released.set.updateNotificationChanges, null);
  assert.equal(released.set.updateNotificationRecipientDiscordIds, null);
  assert.equal(released.set.updateNotificationClaimLeaseUntil, null);

  const corrected = planTrpgSessionUpdate(
    session({ ...pendingFields, updateNotificationClaimLeaseUntil: FUTURE }),
    { title: "A" },
    NOW,
  );
  assert.equal(corrected.queued, true);
  assert.equal(corrected.set.updateNotificationQueuedAt, NOW);
  assert.equal(corrected.set.updateNotificationBaseline.title, "B", "발송 중 내용(B)을 기준으로 정정");
  assert.deepEqual(corrected.set.updateNotificationChanges, ["세션 제목 변경: B → A"]);
  assert.equal("updateNotificationClaimLeaseUntil" in corrected.set, false, "활성 lease 를 지우지 않는다");

  const noop = planTrpgSessionUpdate(
    session({
      ...pendingFields,
      title: "A", // 현재 문서도 baseline 과 같음
      updateNotificationClaimLeaseUntil: FUTURE,
    }),
    { title: "A" },
    NOW,
  );
  assert.equal(noop.queued, true, "대기는 그대로 남는다");
  assert.equal("updateNotificationQueuedAt" in noop.set, false, "바로잡을 것이 없으면 회차를 만들지 않는다");
});

test("plan: 대기·발송 중 무변경 저장(같은 값 재저장)은 회차를 재발급하지 않는다", () => {
  const pendingFields = {
    title: "B",
    updateNotificationQueuedAt: PAST,
    updateNotificationBaseline: {
      title: "A",
      date: "2030-02-01",
      startTime: "20:00",
      participantDiscordIds: ["gm", "p1"],
    },
    updateNotificationRecipientDiscordIds: ["gm", "p1"],
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  };
  for (const lease of [FUTURE, PAST]) {
    const plan = planTrpgSessionUpdate(
      session({ ...pendingFields, updateNotificationClaimLeaseUntil: lease }),
      { title: "B", participantDiscordIds: ["p1", "gm"] },
      NOW,
    );
    const label = lease === FUTURE ? "lease 활성(발송 중)" : "lease 비활성(대기 중)";
    assert.equal(plan.queued, true, `${label}: 대기 회차는 그대로`);
    assert.equal(plan.set.title, "B", `${label}: 본문 필드는 갱신한다`);
    for (const field of [
      "updateNotificationQueuedAt",
      "updateNotificationSentAt",
      "updateNotificationBaseline",
      "updateNotificationChanges",
      "updateNotificationRecipientDiscordIds",
      "updateNotificationClaimLeaseUntil",
    ]) {
      assert.equal(field in plan.set, false, `${label}: ${field} 를 건드리지 않는다`);
    }
    assert.deepEqual(plan.guard, {
      updateNotificationQueuedAt: PAST,
      updateNotificationSentAt: null,
      updateNotificationClaimLeaseUntil: lease,
    });
  }
});

test("plan: 생성 DM 전 수정은 대기열을 쌓지 않고 guard 로 원자성을 보장한다", () => {
  const existing = session({
    notificationSentAt: null,
    notificationClaimedAt: null,
    notificationClaimLeaseUntil: PAST,
  });
  const plan = planTrpgSessionUpdate(existing, { title: "B" }, NOW);
  assert.equal(plan.queued, false);
  assert.equal(plan.set.title, "B");
  assert.equal(plan.set.updateNotificationQueuedAt, null);
  assert.ok(Array.isArray(plan.guard.$and), "생성 미발송 + 선점 이력 없음 + lease 비활성 조건이 필터에 들어간다");
  const leaseClause = plan.guard.$and.find((clause) =>
    clause.$or.some((c) => c.notificationClaimLeaseUntil?.$lte !== undefined),
  );
  assert.ok(leaseClause, "lease 비활성 경계는 `$lte now` (hasActiveLease 의 `> now` 와 일치)");

  const inFlight = session({
    notificationSentAt: null,
    notificationClaimedAt: NOW,
    notificationClaimLeaseUntil: FUTURE,
  });
  const queued = planTrpgSessionUpdate(inFlight, { title: "B" }, NOW);
  assert.equal(queued.queued, true, "생성 lease 가 활성이면 발송 중이므로 대기열을 쌓는다");
});

test("plan: 재일정은 값이 실제로 바뀔 때만 24h·1h 리마인드를 초기화하고 활성 lease 는 남긴다", () => {
  const unchanged = planTrpgSessionUpdate(
    session(),
    { date: "2030-02-01", startTime: "20:00" },
    NOW,
  );
  assert.equal("reminderSentAt" in unchanged.set, false);
  assert.equal(unchanged.queued, false);

  const existing = session({
    reminderSentAt: PAST,
    reminderClaimLeaseUntil: FUTURE, // 24h 발송 중
    reminder1hClaimLeaseUntil: PAST, // 만료
  });
  const plan = planTrpgSessionUpdate(existing, { startTime: "21:00" }, NOW);
  assert.equal(plan.set.reminderSentAt, null);
  assert.equal(plan.set.reminder1hSentAt, null);
  assert.equal("reminderClaimLeaseUntil" in plan.set, false, "활성 24h lease 유지");
  assert.equal(plan.set.reminder1hClaimLeaseUntil, null, "만료된 1h lease 는 정리");
  assert.deepEqual(plan.set.updateNotificationChanges, [
    "일시 변경: 2030-02-01 20:00 → 2030-02-01 21:00",
  ]);
});

test("plan: baseline 없는 레거시 대기 — 변경이 있으면 현재 문서 baseline 으로 새 회차, 무변경 저장은 대기 불변", () => {
  const legacy = {
    title: "B",
    updateNotificationQueuedAt: PAST,
    updateNotificationBaseline: undefined,
    updateNotificationRecipientDiscordIds: ["gm", "p1", "old"],
    updateNotificationChanges: ["세션 제목 변경: A → B"],
  };
  const changed = planTrpgSessionUpdate(session(legacy), { title: "C" }, NOW);
  assert.equal(changed.queued, true);
  assert.equal(changed.set.updateNotificationQueuedAt, NOW);
  assert.equal(changed.set.updateNotificationBaseline.title, "B");
  assert.deepEqual(changed.set.updateNotificationChanges, ["세션 제목 변경: B → C"]);

  const unchanged = planTrpgSessionUpdate(session(legacy), { title: "B" }, NOW);
  assert.equal(unchanged.queued, true, "배포 전 대기분은 그대로 남는다");
  for (const field of [
    "updateNotificationQueuedAt",
    "updateNotificationSentAt",
    "updateNotificationBaseline",
    "updateNotificationChanges",
    "updateNotificationRecipientDiscordIds",
    "updateNotificationClaimLeaseUntil",
  ]) {
    assert.equal(field in unchanged.set, false, `${field} 를 건드리지 않는다`);
  }
});

test("planTrpgSessionCancel: skip 은 queuedAt null + 생성 미발송 guard, queue 는 now + 여집합 guard", () => {
  const skip = planTrpgSessionCancel("skip", NOW);
  assert.equal(skip.set.status, "cancelled");
  assert.equal(skip.set.cancellationNotificationQueuedAt, null);
  assert.ok(Array.isArray(skip.guard.$and));
  assert.equal(skip.guard.$and.length, 3, "미발송 + 선점 이력 없음 + lease 비활성");

  const queue = planTrpgSessionCancel("queue", NOW);
  assert.equal(queue.set.cancellationNotificationQueuedAt, NOW);
  assert.deepEqual(queue.guard, {
    $or: [
      { notificationSentAt: { $ne: null } },
      { notificationClaimedAt: { $ne: null } },
      { notificationClaimLeaseUntil: { $gt: NOW } },
    ],
  });
});
