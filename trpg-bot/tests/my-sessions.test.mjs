import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const { buildMySessionsResponse } = await import("../dist/commands/my-sessions.js");

function session(index, overrides = {}) {
  return {
    _id: { toString: () => `session-${index}` },
    guildId: "test-guild-id",
    title: `세션 ${index}`,
    date: `2026-11-${String(index + 1).padStart(2, "0")}`,
    startTime: "20:00",
    createdByDiscordId: "master-1",
    createdByUsername: "마스터",
    participantDiscordIds: ["user-1", "user-2"],
    status: "open",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("다가오는 내 세션이 없으면 웹 캘린더 링크만 안내한다", () => {
  const response = buildMySessionsResponse({
    sessions: [],
    userId: "user-1",
    baseUrl: "https://example.test",
  });
  assert.match(response.content, /세션이 없습니다/);
  assert.equal(response.embeds.length, 0);
  assert.equal(response.components[0].toJSON().components[0].url, "https://example.test/calendar");
});

test("내 세션마다 일시·마스터·참가 인원과 세션 상세 링크 버튼을 붙인다", () => {
  const sessions = Array.from({ length: 7 }, (_, index) => session(index));
  sessions[1] = session(1, { createdByDiscordId: "user-1" });
  const response = buildMySessionsResponse({
    sessions,
    userId: "user-1",
    baseUrl: "https://example.test",
  });

  const embed = response.embeds[0].toJSON();
  assert.equal(embed.fields.length, 7);
  assert.match(embed.fields[0].name, /^1\. 11\/01\(일\) 20:00 · 세션 0$/);
  assert.match(embed.fields[0].value, /<t:\d+:F> · <t:\d+:R>/);
  assert.match(embed.fields[1].value, /내가 진행/);
  assert.doesNotMatch(embed.fields[0].value, /내가 진행/);

  const rows = response.components.map((row) => row.toJSON());
  assert.equal(rows.length, 2, "한 줄에 버튼 5개까지");
  assert.equal(rows[0].components.length, 5);
  assert.equal(
    rows[0].components[0].url,
    "https://example.test/calendar?sessionId=session-0",
  );
});
