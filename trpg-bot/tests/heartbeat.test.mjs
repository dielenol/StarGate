import test from "node:test";
import assert from "node:assert/strict";
import { Status } from "discord.js";

import { runHeartbeatOnce } from "../dist/utils/heartbeat.js";
import { getTaskRun } from "../dist/utils/runtime-status.js";

/** shard 상태로 게이트웨이를 흉내 낸다 — 운영의 Collection 도 Map 과 같은 `size`·`values()` 를 가진다. */
function shards(...statuses) {
  return new Map(statuses.map((status, index) => [index, { status }]));
}

function options(overrides = {}) {
  const writes = [];
  const pushes = [];
  return {
    writes,
    pushes,
    options: {
      client: { ws: { shards: shards(Status.Ready) } },
      filePath: "/tmp/test-heartbeat",
      pingDb: async () => {},
      writeBeat: async (path, content) => writes.push({ path, content }),
      fetchImpl: async (url) => pushes.push(url),
      now: () => 1_700_000_000_000,
      logWarn: () => {},
      ...overrides,
    },
  };
}

test("게이트웨이와 DB 가 정상이면 생존 신호 파일을 갱신하고 외부 감시로 push 한다", async () => {
  const context = options({ pushUrl: "https://uptime.example/push/abc" });
  assert.deepEqual(await runHeartbeatOnce(context.options), { ok: true, dbOk: true });
  assert.deepEqual(context.writes, [
    { path: "/tmp/test-heartbeat", content: "1700000000000" },
  ]);
  assert.deepEqual(context.pushes, ["https://uptime.example/push/abc"]);
  assert.equal(getTaskRun("heartbeat").ok, true);
  assert.equal(getTaskRun("heartbeat").detail, null);
});

test("shard 가 Ready 가 아니면 파일을 갱신하지 않아 HEALTHCHECK 가 unhealthy 로 판정하게 한다", async () => {
  const context = options({
    client: { ws: { shards: shards(Status.Reconnecting) } },
    pushUrl: "https://uptime.example/push/abc",
  });
  const result = await runHeartbeatOnce(context.options);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "gateway");
  assert.equal(context.writes.length, 0);
  assert.equal(context.pushes.length, 0);
  assert.equal(getTaskRun("heartbeat").ok, false);
  assert.match(getTaskRun("heartbeat").error, /Reconnecting/);
});

test("shard 가 Connecting 이면(재연결 중) reason gateway 이고 쓰기 0회", async () => {
  const context = options({
    client: { ws: { shards: shards(Status.Ready, Status.Connecting) } },
  });
  const result = await runHeartbeatOnce(context.options);
  assert.deepEqual(result, { ok: false, reason: "gateway" });
  assert.equal(context.writes.length, 0);
  assert.match(getTaskRun("heartbeat").error, /Connecting/);

  const empty = options({ client: { ws: { shards: shards() } } });
  assert.deepEqual(await runHeartbeatOnce(empty.options), { ok: false, reason: "gateway" });
  assert.equal(empty.writes.length, 0);
});

test("DB ping 이 실패해도 파일을 갱신하고 push 하며, 기록은 ok:true + detail 에 DB 실패를 남긴다", async () => {
  const context = options({
    pushUrl: "https://uptime.example/push/abc",
    pingDb: async () => {
      throw Object.assign(new Error("server selection timeout"), {
        name: "MongoServerSelectionError",
      });
    },
  });
  const result = await runHeartbeatOnce(context.options);
  assert.equal(result.ok, true);
  assert.equal(result.dbOk, false);
  assert.match(String(result.dbError), /server selection timeout/);
  assert.equal(context.writes.length, 1, "DB 장애는 재시작으로 고칠 수 없다 — 게이트웨이 전용 판정");
  assert.equal(context.pushes.length, 1);
  assert.equal(getTaskRun("heartbeat").ok, true);
  assert.equal(getTaskRun("heartbeat").detail, "db:MongoServerSelectionError");
});

test("파일 쓰기 실패만 ok:false 로 기록한다", async () => {
  const context = options({
    writeBeat: async () => {
      throw new Error("EACCES");
    },
  });
  const result = await runHeartbeatOnce(context.options);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "write");
  assert.equal(getTaskRun("heartbeat").ok, false);
});

test("외부 push 실패는 봇 상태에 영향을 주지 않고 URL 을 로그에 남기지 않는다", async () => {
  const warnings = [];
  const context = options({
    pushUrl: "https://uptime.example/push/secret-token",
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
    logWarn: (message) => warnings.push(message),
  });
  assert.deepEqual(await runHeartbeatOnce(context.options), { ok: true, dbOk: true });
  assert.equal(context.writes.length, 1);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /secret-token/);
});
