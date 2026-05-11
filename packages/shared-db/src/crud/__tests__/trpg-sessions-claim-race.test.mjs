/**
 * trpg_sessions 의 claim race / update race 검증.
 *
 * 시나리오:
 *   1. `claimNotification` 동시 호출 10회 — 정확히 1회만 true 반환.
 *   2. `claimReminder` 동시 호출 10회 — 정확히 1회만 true 반환.
 *   3. `updateTrpgSession` 의 date 변경과 다른 워커의 cancel 이 동시 — 둘 다 정합성 유지.
 *   4. lease 만료 후 다시 claim 가능.
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
  claimNotification,
  claimReminder,
  createTrpgSession,
  ensureAllIndexes,
  findTrpgSessionById,
  getClient,
  initServerless,
  markNotificationSent,
  markReminderSent,
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

    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimReminder(sessionId, leaseUntil)),
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
