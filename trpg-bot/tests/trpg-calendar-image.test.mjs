import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

import puppeteer from "puppeteer";

const execFileAsync = promisify(execFile);

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

test(
  "월간 캘린더는 확대용 1280px 원본 PNG로 렌더링한다",
  { timeout: 45_000 },
  async (context) => {
    try {
      await access(puppeteer.executablePath());
    } catch {
      context.skip("Chromium 실행 파일이 없어 PNG 통합 검사를 건너뜁니다.");
      return;
    }

    const rendererUrl = new URL(
      "../dist/utils/trpg-calendar-image.js",
      import.meta.url,
    ).href;
    const script = `
      const { closeTrpgCalendarBrowser, renderTrpgCalendarPng } = await import(${JSON.stringify(rendererUrl)});
      let exitCode = 0;
      try {
        const png = await renderTrpgCalendarPng({
          year: 2026,
          month: 8,
          sessions: [{ date: "2026-08-13", startTime: "20:00", title: "긴 한글 세션 제목 확대 확인" }],
          todayDay: 13,
        });
        if (!png) throw new Error("PNG render returned null");
        console.log(JSON.stringify({
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
          bytes: png.length,
        }));
      } catch (error) {
        console.error(error);
        exitCode = 1;
      } finally {
        await closeTrpgCalendarBrowser();
      }
      process.exit(exitCode);
    `;
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        env: { ...process.env, RESULT_CARD_IMAGE: "1" },
        timeout: 45_000,
      },
    );
    const result = JSON.parse(stdout.trim());

    assert.equal(result.width, 1280);
    assert.ok(result.height > 0);
    assert.ok(result.bytes > 0);
  },
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
