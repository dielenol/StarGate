import assert from "node:assert/strict";
import test from "node:test";

const requiredEnv = {
  DISCORD_TOKEN: "test-token",
  DISCORD_CLIENT_ID: "test-client",
  MONGODB_URI: "mongodb://127.0.0.1:27017/test",
  TRPG_GUILD_ID: "test-guild",
  TRPG_FALLBACK_CHANNEL_ID: "test-channel",
  TRPG_WEB_BASE_URL: "https://example.test",
};

for (const [key, value] of Object.entries(requiredEnv)) {
  process.env[key] ||= value;
}
const { buildTrpgCalendarHtml } = await import(
  "../dist/utils/trpg-calendar-image.js"
);

test("월간 캘린더는 긴 제목을 축약하지 않고 줄바꿈한다", () => {
  const longTitle = "긴한글세션제목".repeat(15).slice(0, 100);
  const html = buildTrpgCalendarHtml({
    year: 2026,
    month: 8,
    sessions: [
      {
        date: "2026-08-13",
        startTime: "20:00",
        title: longTitle,
      },
    ],
    todayDay: 13,
  });

  assert.ok(html.includes(longTitle));
  assert.doesNotMatch(html, new RegExp(`${longTitle.slice(0, 11)}…`));
  assert.match(html, /white-space:\s*normal/);
  assert.match(html, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(html, /text-overflow:\s*ellipsis/);
});
