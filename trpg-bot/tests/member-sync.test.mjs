/**
 * 길드 멤버 전체 동기화 테스트 (Discord·DB 없이 가짜 의존성).
 *
 *   - 이탈 마킹은 동기화 시작 시각을 `onlyIfSyncedBefore` 로 넘겨, fetch 중 이벤트로
 *     갱신된 멤버를 이탈자로 오판하지 않는다.
 *   - 성공·실패 모두 `recordTaskRun("member-sync", …)` 를 남긴다.
 *   - 일일 재동기화 실패는 `member-daily-sync` 운영 알림을 보낸다.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { startGuildMemberDailySync, syncAllGuildMembers } = await import(
  "../dist/services/member-sync.js"
);

const GUILD = "guild-1";

function member(id, { bot = false, nickname = null } = {}) {
  return {
    nickname,
    joinedAt: new Date("2029-01-01T00:00:00Z"),
    user: { id, bot, username: `${id}-name`, globalName: null },
    displayAvatarURL: () => `https://cdn.example/${id}.webp`,
  };
}

function fakeClient(members, { fail = false } = {}) {
  return {
    guilds: {
      async fetch(guildId) {
        assert.equal(guildId, GUILD);
        if (fail) throw new Error("gateway down");
        return {
          members: {
            async fetch() {
              return new Map(members.map((m) => [m.user.id, m]));
            },
          },
        };
      },
    },
  };
}

function fakeDeps({ active = [], markLeftResult = true } = {}) {
  const calls = { upsert: [], markLeft: [], taskRuns: [] };
  let clock = new Date("2030-01-01T00:00:00Z").getTime();
  const deps = {
    upsert: async (input) => {
      calls.upsert.push(input);
    },
    listActive: async () => active,
    markLeft: async (guildId, discordUserId, leftAt, options) => {
      calls.markLeft.push({ guildId, discordUserId, leftAt, options });
      return markLeftResult;
    },
    recordTaskRun: (name, result) => {
      calls.taskRuns.push({ name, ...result });
    },
    // 호출마다 1초씩 흐르는 시계 — 시작 시각과 upsert 시각을 구분한다.
    now: () => {
      clock += 1_000;
      return new Date(clock);
    },
  };
  return { deps, calls };
}

test("전체 동기화: 봇을 제외하고 upsert 하고, 미노출 멤버는 시작 시각 기준으로만 이탈 처리한다", async () => {
  const client = fakeClient([
    member("m1", { nickname: "닉" }),
    member("m2"),
    member("bot", { bot: true }),
  ]);
  const { deps, calls } = fakeDeps({
    active: [{ discordUserId: "m1" }, { discordUserId: "gone" }],
  });

  const result = await syncAllGuildMembers(client, GUILD, deps);

  assert.deepEqual(result, { upserted: 2, markedLeft: 1 });
  assert.deepEqual(
    calls.upsert.map((u) => [u.discordUserId, u.displayName, u.leftAt]),
    [
      ["m1", "닉", null],
      ["m2", "m2-name", null],
    ],
  );
  assert.equal(calls.markLeft.length, 1);
  const [left] = calls.markLeft;
  assert.equal(left.discordUserId, "gone");
  assert.ok(
    left.options.onlyIfSyncedBefore instanceof Date,
    "onlyIfSyncedBefore 를 넘긴다",
  );
  assert.ok(
    left.options.onlyIfSyncedBefore.getTime() < calls.upsert[0].lastSyncedAt.getTime(),
    "기준은 upsert 시각이 아니라 동기화 시작 시각이다",
  );
  assert.equal(left.leftAt.getTime(), calls.upsert[0].lastSyncedAt.getTime());
  assert.deepEqual(calls.taskRuns, [
    { name: "member-sync", ok: true, processed: 2, detail: "markedLeft=1" },
  ]);
});

test("경합: 시작 이후 갱신된 멤버는 markLeft 가 0건을 돌려주고 markedLeft 에 세지 않는다", async () => {
  const client = fakeClient([member("m1")]);
  const { deps, calls } = fakeDeps({
    active: [{ discordUserId: "joined-during-fetch" }],
    markLeftResult: false, // DB 필터(lastSyncedAt < startedAt)가 걸러낸 상황
  });
  const result = await syncAllGuildMembers(client, GUILD, deps);
  assert.deepEqual(result, { upserted: 1, markedLeft: 0 });
  assert.equal(calls.markLeft.length, 1);
});

test("동기화 실패는 ok:false 로 기록하고 그대로 throw 한다", async () => {
  const client = fakeClient([], { fail: true });
  const { deps, calls } = fakeDeps();
  await assert.rejects(() => syncAllGuildMembers(client, GUILD, deps), /gateway down/);
  assert.equal(calls.taskRuns.length, 1);
  assert.equal(calls.taskRuns[0].ok, false);
  assert.match(String(calls.taskRuns[0].error), /gateway down/);
});

test("일일 재동기화 실패는 member-daily-sync 운영 알림을 보낸다", async () => {
  const alerts = [];
  let resolveNotified;
  const notified = new Promise((r) => {
    resolveNotified = r;
  });
  const stop = startGuildMemberDailySync({}, GUILD, {
    intervalMs: 1,
    sync: async () => {
      throw new Error("sync exploded");
    },
    operatorAlerts: {
      notify: async (event) => {
        alerts.push(event);
        resolveNotified();
        return { suppressed: false, dm: "sent", channel: "sent" };
      },
    },
  });
  await notified;
  stop();
  assert.equal(alerts[0].key, "member-daily-sync");
  assert.equal(alerts[0].severity, "warning");
  assert.equal(alerts[0].context.길드, GUILD);
  assert.match(String(alerts[0].error), /sync exploded/);
});
