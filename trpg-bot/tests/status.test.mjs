import test from "node:test";
import assert from "node:assert/strict";
import { MessageFlags } from "discord.js";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { buildStatusEmbed, handleStatusCommand } = await import(
  "../dist/commands/status.js"
);
const { recordTaskRun } = await import("../dist/utils/runtime-status.js");

function dependencies(overrides = {}) {
  return {
    gatewayPingMs: () => 42,
    pingDb: async () => {},
    music: {
      getRuntimeInfo: () => ({ ytDlpVersion: "2026.8.18", ffmpegVersion: "ffmpeg 7" }),
      getRuntimeError: () => null,
      activeSessionCount: 1,
    },
    ...overrides,
  };
}

function text(embed) {
  const json = embed.toJSON();
  return [json.title, ...json.fields.map((field) => `${field.name}\n${field.value}`)].join("\n");
}

test("상태 진단은 주기 작업의 마지막 결과와 실패 원인을 민감값 없이 보여 준다", async () => {
  const now = Date.now();
  recordTaskRun("scheduler:creation", { ok: true, processed: 2 }, now - 60_000);
  recordTaskRun("scheduler:reminder24h", { ok: false, error: "first" }, now - 120_000);
  recordTaskRun("scheduler:reminder24h", { ok: false, error: "timeout" }, now - 30_000);
  recordTaskRun(
    "member-sync",
    {
      ok: false,
      error: new Error("fetch https://discord.com/api?token=abc failed password=hunter2"),
    },
    now - 10_000,
  );

  const embed = await buildStatusEmbed(dependencies({ now: () => now }));
  const body = text(embed);
  assert.match(body, /확인이 필요한 항목/);
  assert.match(body, /✅ 생성 알림 — 1분 전 · 2건/);
  assert.match(body, /❌ 24시간 전 리마인드 — 0분 전 실패 \(연속 2회\) · timeout/);
  assert.match(body, /❌ 멤버 동기화 — 0분 전 실패 · Error: fetch \[URL\] failed password=\[REDACTED\]/);
  assert.match(body, /게이트웨이 42ms · DB ✅/);
  assert.match(body, /yt-dlp 2026\.8\.18 · ffmpeg 7 · 연결 1곳/);
  assert.doesNotMatch(body, /hunter2|token=abc/);
});

test("DB 응답이 없고 음악 런타임이 준비되지 않으면 원인을 함께 표시한다", async () => {
  const embed = await buildStatusEmbed(
    dependencies({
      pingDb: async () => {
        throw new Error("server selection timeout");
      },
      music: {
        getRuntimeInfo: () => null,
        getRuntimeError: () => "yt-dlp --version timeout",
        activeSessionCount: 0,
      },
    }),
  );
  const body = text(embed);
  assert.match(body, /DB ❌ Error: server selection timeout/);
  assert.match(body, /❌ yt-dlp --version timeout/);
});

test("서버 관리 권한이 없으면 진단을 보여 주지 않는다", async () => {
  const replies = [];
  await handleStatusCommand(
    {
      guildId: "test-guild-id",
      inGuild: () => true,
      memberPermissions: { has: () => false },
      async reply(payload) {
        replies.push(payload);
      },
    },
    dependencies(),
  );
  assert.equal(replies[0].flags, MessageFlags.Ephemeral);
  assert.match(replies[0].content, /서버 관리 권한/);
});
