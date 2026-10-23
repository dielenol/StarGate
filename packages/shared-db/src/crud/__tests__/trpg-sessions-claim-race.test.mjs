/**
 * trpg_sessions 의 claim race / update race 검증.
 *
 * 시나리오:
 *   1. `claimNotification` 동시 호출 10회 — 정확히 1회만 true 반환.
 *   2. `claimCancellationNotification` 동시 10회 — 생성 DM 이 나간 뒤 취소한 세션만 대기열에 적재.
 *   3. `claimReminder` 동시 호출 10회 — 정확히 1회만 true 반환.
 *   4. lease 만료 후 다시 claim 가능.
 *   5. 재일정 후 리마인드 재 claim — 발송 중 재일정되면 mark 가 회차 불일치로 false.
 *   6. 연속 2회 수정 — 첫 대기 시점 baseline 이 보존되고 변경 요약이 병합되며 회차는 재발급된다.
 *   7. 생성 DM 전 수정·취소 — 대기열을 적재하지 않는다. 단 한 번이라도 선점된 세션은 적재하고,
 *      생성 알림이 완료(notificationSentAt)되기 전에는 수정 알림 claim 이 실패한다.
 *   8. `updateTrpgSession` 의 date 변경과 다른 워커의 cancel 이 동시 — 둘 다 정합성 유지.
 *
 * MONGODB_URI 가 없으면 skip.
 */

import { test, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cancelTrpgSession,
  claimCancellationNotification,
  claimNotification,
  claimReminder,
  claimUpdateNotification,
  createTrpgSession,
  ensureAllIndexes,
  findUnnotifiedCancelledTrpgSessions,
  findUnnotifiedUpdatedTrpgSessions,
  findTrpgSessionById,
  getClient,
  initServerless,
  markCancellationNotificationSent,
  markNotificationSent,
  markReminderSent,
  releaseNotificationClaim,
  releaseReminderClaim,
  trpgSessionsCol,
  updateTrpgSession,
} from "../../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "../../../../../StarGateV2/.env.local");

function loadEnv() {
  try {
    const content = readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* .env.local 없음 — skip */
  }
}
loadEnv();

const HAS_DB =
  typeof process.env.MONGODB_URI === "string" &&
  process.env.MONGODB_URI.length > 0;
const TEST_DB_NAME = "stargate_test_trpg_claim_race";
const TEST_GUILD = "test-guild-trpg-claim";

/** 리마인드 claim/mark 에 넘길 회차 스냅샷 */
function reminderRound(session, slot = "24h") {
  return { slot, date: session.date, startTime: session.startTime };
}

before(async () => {
  if (!HAS_DB) return;
  initServerless({ uri: process.env.MONGODB_URI, dbName: TEST_DB_NAME });
  await ensureAllIndexes();
  // 사전 cleanup
  const col = await trpgSessionsCol();
  await col.deleteMany({ guildId: TEST_GUILD });
});

after(async () => {
  if (!HAS_DB) return;
  const col = await trpgSessionsCol();
  await col.deleteMany({ guildId: TEST_GUILD });
  const client = await getClient().catch(() => null);
  if (client) await client.close().catch(() => {});
});

test(
  "RACE: claimNotification 동시 10회 — 정확히 1회만 true",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "race notification",
      date: "2026-06-01",
      startTime: "20:00",
      createdByDiscordId: "creator-1",
      createdByUsername: "creator",
      participantDiscordIds: ["p1", "p2"],
    });

    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimNotification(sessionId, leaseUntil)),
    );

    const trueCount = results.filter((v) => v === true).length;
    assert.equal(
      trueCount,
      1,
      `claimNotification 은 10회 중 정확히 1회만 true 여야 하지만 ${trueCount}회 true`,
    );
  },
);

test(
  "RACE: claimCancellationNotification 동시 10회 — 생성 DM 후 취소한 세션은 정확히 1회만 true",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "race cancellation",
      date: "2026-06-02",
      startTime: "21:00",
      createdByDiscordId: "creator-cancel",
      createdByUsername: "creator",
      participantDiscordIds: ["p1", "p2"],
    });

    // 생성 DM 이 먼저 나가야 취소 알림 대기열에 적재된다 (B5).
    assert.equal(await markNotificationSent(sessionId), true);

    const cancelRes = await cancelTrpgSession(sessionId, "creator-cancel");
    assert.equal(cancelRes.kind, "cancelled");

    const pending = await findUnnotifiedCancelledTrpgSessions(new Date());
    assert.ok(
      pending.some((s) => String(s._id) === sessionId),
      "생성 DM 후 취소된 세션은 취소 알림 후보로 조회되어야 함",
    );

    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimCancellationNotification(sessionId, leaseUntil),
      ),
    );

    const trueCount = results.filter((v) => v === true).length;
    assert.equal(
      trueCount,
      1,
      `claimCancellationNotification 은 10회 중 정확히 1회만 true 여야 하지만 ${trueCount}회 true`,
    );

    assert.equal(await markCancellationNotificationSent(sessionId), true);
    const afterMark = await claimCancellationNotification(sessionId, leaseUntil);
    assert.equal(
      afterMark,
      false,
      "markCancellationNotificationSent 후에는 claimCancellationNotification 이 false 여야 함",
    );
  },
);

test(
  "RACE: claimReminder 동시 10회 — 정확히 1회만 true",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "race reminder",
      date: "2026-06-02",
      startTime: "20:00",
      createdByDiscordId: "creator-2",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });
    // 리마인드 선행조건: 생성 DM 이 먼저 나가야 claim 된다.
    await markNotificationSent(sessionId);
    const session = await findTrpgSessionById(sessionId);

    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimReminder(sessionId, leaseUntil, reminderRound(session)),
      ),
    );

    const trueCount = results.filter((v) => v === true).length;
    assert.equal(
      trueCount,
      1,
      `claimReminder 는 10회 중 정확히 1회만 true 여야 하지만 ${trueCount}회 true`,
    );
  },
);

test(
  "IDEMPOTENT: claim 후 markNotificationSent → 같은 lease 로 재 claim 불가",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "idempotent",
      date: "2026-06-03",
      startTime: "20:00",
      createdByDiscordId: "creator-3",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });

    const lease = new Date(Date.now() + 5 * 60 * 1000);
    const first = await claimNotification(sessionId, lease);
    assert.equal(first, true);
    await markNotificationSent(sessionId);

    // 발송 완료 후 — notificationSentAt 이 있으니 lease 갱신은 불가
    const second = await claimNotification(sessionId, lease);
    assert.equal(
      second,
      false,
      "markNotificationSent 후에는 claimNotification 이 false 여야 함",
    );
  },
);

test(
  "LEASE 만료 후 재 claim 가능",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "lease expire",
      date: "2026-06-04",
      startTime: "20:00",
      createdByDiscordId: "creator-4",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });

    // 과거 lease 로 점유 — 즉시 만료 상태
    const pastLease = new Date(Date.now() - 1000);
    const first = await claimNotification(sessionId, pastLease);
    assert.equal(first, true);

    // 다른 워커가 다시 시도 — lease 만료이므로 성공
    const future = new Date(Date.now() + 5 * 60 * 1000);
    const second = await claimNotification(sessionId, future);
    assert.equal(
      second,
      true,
      "lease 만료 후에는 다른 워커가 claim 가능해야 함",
    );
  },
);

test(
  "ROUND: 재일정 후 리마인드 재 claim — 발송 중 재일정되면 mark 회차 불일치",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "reschedule reminder",
      date: "2026-06-08",
      startTime: "20:00",
      createdByDiscordId: "creator-reschedule",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });
    await markNotificationSent(sessionId);
    const original = await findTrpgSessionById(sessionId);
    const oldRound = reminderRound(original);

    // 워커 A 가 옛 회차를 선점한 채 발송 중 … 그 사이 GM 이 재일정.
    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    assert.equal(await claimReminder(sessionId, leaseUntil, oldRound), true);
    const updateRes = await updateTrpgSession(sessionId, "creator-reschedule", {
      startTime: "21:00",
    });
    assert.equal(updateRes.kind, "updated");
    assert.equal(
      updateRes.session.reminderClaimLeaseUntil?.getTime(),
      leaseUntil.getTime(),
      "활성 lease 는 updateTrpgSession 이 지우지 않는다",
    );
    assert.equal(updateRes.session.reminderSentAt, null);

    // 옛 회차로 mark → 불일치 → false. 워커는 자기 lease 만 해제한다.
    assert.equal(await markReminderSent(sessionId, oldRound), false);
    await releaseReminderClaim(sessionId, leaseUntil, "24h");

    const after = await findTrpgSessionById(sessionId);
    assert.equal(after.reminderSentAt, null, "옛 회차 mark 는 발송 완료로 남지 않는다");
    assert.equal(after.reminderClaimLeaseUntil, null, "release 로 lease 가 풀린다");

    // 옛 회차로는 더 이상 claim 되지 않고 새 회차로만 claim 된다.
    const nextLease = new Date(Date.now() + 5 * 60 * 1000);
    assert.equal(await claimReminder(sessionId, nextLease, oldRound), false);
    assert.equal(await claimReminder(sessionId, nextLease, reminderRound(after)), true);
    assert.equal(await markReminderSent(sessionId, reminderRound(after)), true);
    const done = await findTrpgSessionById(sessionId);
    assert.ok(done.reminderSentAt instanceof Date);
    assert.equal(done.reminderClaimLeaseUntil, null);
  },
);

test(
  "MERGE: 연속 2회 수정 — 첫 대기 시점 baseline 보존, 변경 요약 병합",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "merge A",
      date: "2026-06-09",
      startTime: "20:00",
      createdByDiscordId: "creator-merge",
      createdByUsername: "creator",
      participantDiscordIds: ["creator-merge", "p1"],
    });
    await markNotificationSent(sessionId);

    const first = await updateTrpgSession(sessionId, "creator-merge", {
      title: "merge B",
    });
    assert.equal(first.kind, "updated");
    const queuedAt = first.session.updateNotificationQueuedAt;
    assert.ok(queuedAt instanceof Date);
    assert.deepEqual(first.session.updateNotificationBaseline, {
      title: "merge A",
      date: "2026-06-09",
      startTime: "20:00",
      participantDiscordIds: ["creator-merge", "p1"],
    });

    const second = await updateTrpgSession(sessionId, "creator-merge", {
      title: "merge C",
      participantDiscordIds: ["creator-merge", "p2"],
    });
    assert.equal(second.kind, "updated");
    assert.ok(
      second.session.updateNotificationQueuedAt instanceof Date &&
        second.session.updateNotificationQueuedAt.getTime() > queuedAt.getTime(),
      "대기 중 수정은 회차(queuedAt)를 새로 발급한다 — 부분 수신자도 누적 요약을 다시 받는다",
    );
    assert.equal(second.session.updateNotificationSentAt, null);
    assert.deepEqual(
      second.session.updateNotificationBaseline,
      first.session.updateNotificationBaseline,
      "baseline 은 첫 대기 시점 그대로",
    );
    assert.deepEqual(second.session.updateNotificationChanges, [
      "세션 제목 변경: merge A → merge C",
      "참가 대상 변경: 추가 1명, 제외 1명",
    ]);
    assert.deepEqual(
      [...second.session.updateNotificationRecipientDiscordIds].sort(),
      ["creator-merge", "p1", "p2"],
    );

    const pending = await findUnnotifiedUpdatedTrpgSessions(new Date());
    assert.equal(
      pending.filter((s) => String(s._id) === sessionId).length,
      1,
      "대기열에는 한 회차만 남는다",
    );

    // 되돌리면 대기 해제.
    const revert = await updateTrpgSession(sessionId, "creator-merge", {
      title: "merge A",
      participantDiscordIds: ["creator-merge", "p1"],
    });
    assert.equal(revert.kind, "updated");
    assert.equal(revert.session.updateNotificationQueuedAt, null);
    assert.equal(revert.session.updateNotificationBaseline, null);
    assert.equal(revert.session.updateNotificationChanges, null);
  },
);

test(
  "B5: 생성 DM 전 수정·취소 — 대기열을 적재하지 않는다",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "before creation dm",
      date: "2026-06-10",
      startTime: "20:00",
      createdByDiscordId: "creator-b5",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });

    const updated = await updateTrpgSession(sessionId, "creator-b5", {
      title: "edited before dm",
    });
    assert.equal(updated.kind, "updated");
    assert.equal(updated.session.title, "edited before dm");
    assert.equal(
      updated.session.updateNotificationQueuedAt,
      null,
      "생성 DM 전 수정은 수정 알림을 쌓지 않는다",
    );

    const cancelled = await cancelTrpgSession(sessionId, "creator-b5");
    assert.equal(cancelled.kind, "cancelled");
    const after = await findTrpgSessionById(sessionId);
    assert.equal(after.status, "cancelled");
    assert.equal(
      after.cancellationNotificationQueuedAt,
      null,
      "생성 DM 전 취소는 취소 알림을 쌓지 않는다",
    );
    const pending = await findUnnotifiedCancelledTrpgSessions(new Date());
    assert.ok(!pending.some((s) => String(s._id) === sessionId));

    // 반대로 생성 lease 가 활성(발송 중)이면 수정 알림을 쌓는다.
    const inFlightId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "creation in flight",
      date: "2026-06-10",
      startTime: "21:00",
      createdByDiscordId: "creator-b5",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });
    const creationLease = new Date(Date.now() + 5 * 60 * 1000);
    assert.equal(await claimNotification(inFlightId, creationLease), true);
    const queued = await updateTrpgSession(inFlightId, "creator-b5", {
      title: "edited while sending",
    });
    assert.equal(queued.kind, "updated");
    const queuedAt = queued.session.updateNotificationQueuedAt;
    assert.ok(queuedAt instanceof Date);

    // 생성 알림이 완료되기 전에는 수정 알림을 claim 하지 않는다 (수정 DM 이 생성 DM 보다 먼저 가지 않게).
    assert.equal(
      await claimUpdateNotification(
        inFlightId,
        new Date(Date.now() + 5 * 60 * 1000),
        queuedAt,
      ),
      false,
      "생성 알림 발송 중에는 수정 알림을 선점하지 않는다",
    );

    // 일부만 보낸 뒤 종료 → lease 해제(mark 없음). 선점 흔적(notificationClaimedAt)이 남아
    // "안내받은 세션" 으로 판정되므로 후속 수정·취소 대기열을 쌓는다.
    await releaseNotificationClaim(inFlightId, creationLease);
    const aborted = await findTrpgSessionById(inFlightId);
    assert.equal(aborted.notificationSentAt, null);
    assert.equal(aborted.notificationClaimLeaseUntil, null);
    assert.ok(aborted.notificationClaimedAt instanceof Date, "release 는 선점 흔적을 지우지 않는다");

    const afterAbort = await updateTrpgSession(inFlightId, "creator-b5", {
      date: "2026-06-11",
    });
    assert.equal(afterAbort.kind, "updated");
    assert.ok(
      afterAbort.session.updateNotificationQueuedAt instanceof Date &&
        afterAbort.session.updateNotificationQueuedAt.getTime() > queuedAt.getTime(),
      "부분 발송 뒤 수정은 새 회차로 대기열에 남는다",
    );
    assert.equal(
      await claimUpdateNotification(
        inFlightId,
        new Date(Date.now() + 5 * 60 * 1000),
        afterAbort.session.updateNotificationQueuedAt,
      ),
      false,
      "생성 lease 가 풀려도 생성 알림이 완료(notificationSentAt)되기 전에는 선점하지 않는다",
    );
    assert.equal(await markNotificationSent(inFlightId), true);
    assert.equal(
      await claimUpdateNotification(
        inFlightId,
        new Date(Date.now() + 5 * 60 * 1000),
        afterAbort.session.updateNotificationQueuedAt,
      ),
      true,
      "생성 알림 완료 뒤에는 수정 알림을 선점할 수 있다",
    );

    const cancelledAfterAbort = await cancelTrpgSession(inFlightId, "creator-b5");
    assert.equal(cancelledAfterAbort.kind, "cancelled");
    const finalDoc = await findTrpgSessionById(inFlightId);
    assert.ok(
      finalDoc.cancellationNotificationQueuedAt instanceof Date,
      "부분 발송 뒤 취소는 취소 알림을 쌓는다",
    );
  },
);

test(
  "RACE: updateTrpgSession + cancelTrpgSession 동시 — 정합성 유지",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "patch-vs-cancel race",
      date: "2026-06-05",
      startTime: "20:00",
      createdByDiscordId: "creator-5",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });

    const [updateRes, cancelRes] = await Promise.all([
      updateTrpgSession(sessionId, "creator-5", { date: "2026-06-06" }),
      cancelTrpgSession(sessionId, "creator-5"),
    ]);

    // 두 작업이 직렬화될 수 있는 모든 조합을 허용:
    //   (a) update 먼저: updated + cancelled  → 최종 cancelled (date 는 2026-06-06)
    //   (b) cancel 먼저: not-open + cancelled → 최종 cancelled (date 는 2026-06-05)
    // 단 invariant: cancel 이 cancelled 면 최종 status 는 반드시 cancelled.
    const after = await findTrpgSessionById(sessionId);
    assert.ok(after, "race 후 세션 존재 확인");

    const validCombo =
      (updateRes.kind === "updated" && cancelRes.kind === "cancelled") ||
      (updateRes.kind === "not-open" && cancelRes.kind === "cancelled") ||
      (updateRes.kind === "updated" && cancelRes.kind === "already-cancelled");
    assert.ok(
      validCombo,
      `허용되지 않는 결과 조합: update=${updateRes.kind} cancel=${cancelRes.kind}`,
    );

    if (cancelRes.kind === "cancelled" || cancelRes.kind === "already-cancelled") {
      assert.equal(
        after.status,
        "cancelled",
        "cancel 이 진행됐다면 최종 status 는 cancelled",
      );
    }
  },
);

test(
  "RACE: updateTrpgSession 의 forbidden 검증 race — 다른 사용자가 cancel 한 후 호출",
  { skip: !HAS_DB && "MONGODB_URI 없음" },
  async () => {
    const sessionId = await createTrpgSession({
      guildId: TEST_GUILD,
      title: "forbidden race",
      date: "2026-06-07",
      startTime: "20:00",
      createdByDiscordId: "owner",
      createdByUsername: "creator",
      participantDiscordIds: ["p1"],
    });

    // 다른 사용자가 update 시도 — forbidden
    const res = await updateTrpgSession(sessionId, "not-owner", {
      title: "stolen",
    });
    assert.equal(res.kind, "forbidden");

    // 데이터 변경 없음 확인
    const after = await findTrpgSessionById(sessionId);
    assert.equal(after?.title, "forbidden race");
  },
);
