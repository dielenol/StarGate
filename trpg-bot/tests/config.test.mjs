import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CONFIG_URL = new URL("../dist/config.js", import.meta.url).href;

const BASE_ENV = {
  PATH: process.env.PATH ?? "",
  DOTENV_CONFIG_PATH: "/dev/null",
  DISCORD_TOKEN: "test-token",
  DISCORD_CLIENT_ID: "test-client-id",
  MONGODB_URI: "mongodb://localhost:27017/test",
  TRPG_GUILD_ID: "test-guild-id",
  TRPG_FALLBACK_CHANNEL_ID: "test-channel-id",
  TRPG_WEB_BASE_URL: "https://example.test/",
};

/** 깨끗한 환경의 별도 프로세스에서 config 를 불러와 결과를 JSON 으로 돌려받는다. */
async function loadConfig(env) {
  const script = `
    const { config } = await import(${JSON.stringify(CONFIG_URL)});
    console.log(JSON.stringify(config));
  `;
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { env: { ...BASE_ENV, ...env } },
  );
  return { config: JSON.parse(stdout.trim().split("\n").at(-1)), stderr };
}

test("웹 베이스 URL 은 끝 슬래시를 정리하고, 스킴이 없으면 기동을 막는다", async () => {
  const { config } = await loadConfig({});
  assert.equal(config.trpgWebBaseUrl, "https://example.test");

  await assert.rejects(
    loadConfig({ TRPG_WEB_BASE_URL: "dache-calender.vercel.app" }),
    (error) => /TRPG_WEB_BASE_URL 이 올바르지 않습니다/.test(error.stderr),
  );
});

test("주기 값이 허용 범위를 벗어나면 경고하고 기본값을 쓴다", async () => {
  const { config, stderr } = await loadConfig({
    TRPG_POLLING_INTERVAL_MS: "0.5",
    TRPG_REMINDER_INTERVAL_MS: "86400000",
    TRPG_MUSIC_HEALTHCHECK_INTERVAL_MS: "2592000000",
  });
  assert.equal(config.trpgPollingIntervalMs, 60_000);
  assert.equal(config.trpgReminderIntervalMs, 300_000);
  assert.equal(config.musicHealthcheckIntervalMs, 86_400_000);
  assert.match(stderr, /TRPG_POLLING_INTERVAL_MS=0\.5/);
  assert.match(stderr, /TRPG_MUSIC_HEALTHCHECK_INTERVAL_MS=2592000000/);
});

test("1시간 전 리마인드는 기본으로 켜고 0/false/off 로 끈다", async () => {
  assert.equal((await loadConfig({})).config.trpgReminder1hEnabled, true);
  assert.equal(
    (await loadConfig({ TRPG_REMINDER_1H: "off" })).config.trpgReminder1hEnabled,
    false,
  );
});

test("생존 신호 push URL 은 http(s) 만 받고, 틀리면 push 만 끈다", async () => {
  const valid = await loadConfig({ TRPG_HEARTBEAT_URL: "https://uptime.example/push/x" });
  assert.equal(valid.config.heartbeatPushUrl, "https://uptime.example/push/x");
  assert.equal(valid.config.heartbeatFilePath, "/tmp/trpg-bot-heartbeat");

  const invalid = await loadConfig({ TRPG_HEARTBEAT_URL: "uptime.example" });
  assert.equal(invalid.config.heartbeatPushUrl, undefined);
  assert.match(invalid.stderr, /TRPG_HEARTBEAT_URL/);
});
