import test from "node:test";
import assert from "node:assert/strict";

import { applyTestEnv } from "./helpers/test-env.mjs";

applyTestEnv();

const {
  buildCalendarResponse,
  buildCalendarWebUrl,
  buildMonthNavigation,
  buildSessionDetailResponse,
  isSessionCheckCustomId,
  parseSessionCheckCustomId,
} = await import("../dist/commands/trpg-session-check.js");

function session(index, { participants = 3, titleLength = 20 } = {}) {
  const day = String((index % 28) + 1).padStart(2, "0");
  return {
    guildId: "test-guild-id",
    title: `세션${index}`.padEnd(titleLength, "가"),
    date: `2026-11-${day}`,
    startTime: "20:00",
    createdByDiscordId: "100000000000000000",
    createdByUsername: "마스터",
    participantDiscordIds: Array.from(
      { length: participants },
      (_, i) => String(200000000000000000n + BigInt(index * 100 + i)),
    ),
    status: "open",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

/** Discord 가 6000자 상한으로 세는 embed 글자 수 */
function embedLength(embed) {
  const json = embed.toJSON();
  return (
    (json.title?.length ?? 0) +
    (json.description?.length ?? 0) +
    (json.footer?.text.length ?? 0) +
    (json.author?.name.length ?? 0) +
    (json.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  );
}

function respond(sessions, overrides = {}) {
  return buildCalendarResponse({
    year: 2026,
    month: 11,
    sessions,
    webUrl: "https://example.test/calendar?date=2026-11-01",
    hasImage: false,
    todayKey: "2026-10-22",
    mode: "detail",
    ...overrides,
  });
}

test("참가자가 많은 달도 embed 총합 6000자 안에서 응답하고 나머지는 더 보기로 센다", () => {
  const sessions = Array.from({ length: 14 }, (_, i) =>
    session(i, { participants: 50, titleLength: 100 }),
  );
  const [embed] = respond(sessions).embeds;
  const json = embed.toJSON();

  assert.ok(embedLength(embed) <= 6000, `length=${embedLength(embed)}`);
  assert.ok(json.fields.length <= 25);
  const more = json.fields.find((field) => field.name === "더 보기");
  assert.ok(more, "더 보기 필드가 있어야 한다");
  const listed = json.fields.filter((field) => /^\d{2}\. /.test(field.name)).length;
  assert.match(more.value, new RegExp(`외 ${sessions.length - listed}건`));
});

test("세션이 적으면 최대 12건까지 모두 나열한다", () => {
  const [embed] = respond(Array.from({ length: 12 }, (_, i) => session(i))).embeds;
  const json = embed.toJSON();
  assert.equal(json.fields.filter((field) => /^\d{2}\. /.test(field.name)).length, 12);
  assert.equal(json.fields.some((field) => field.name === "더 보기"), false);
});

test("요약 모드는 세션 상세 필드를 넣지 않는다", () => {
  const [embed] = respond([session(1)], { mode: "summary" }).embeds;
  assert.equal(
    embed.toJSON().fields.some((field) => /^\d{2}\. /.test(field.name)),
    false,
  );
});

test("상세 모드는 세션 선택 메뉴를 최대 25개까지 붙이고 요약 모드는 붙이지 않는다", () => {
  const sessions = Array.from({ length: 30 }, (_, i) => ({
    ...session(i),
    _id: { toString: () => `session-${i}` },
  }));
  const detail = respond(sessions);
  const select = detail.components[1].toJSON().components[0];
  assert.equal(select.custom_id, "trpg:session-check:v1:detail");
  assert.equal(select.options.length, 25);
  assert.equal(select.options[0].value, "session-0");
  assert.match(select.options[0].description, /마스터 마스터 · 참가 3명/);

  const summary = respond(sessions, { mode: "summary" });
  assert.equal(summary.components.length, 1);
});

test("이전 달은 이번 달보다 앞으로 갈 수 없고, 다음 달은 2100년까지만 간다", () => {
  const current = { year: 2026, month: 10 };
  assert.deepEqual(buildMonthNavigation({ year: 2026, month: 10, current }), {
    previous: null,
    next: { year: 2026, month: 11 },
  });
  assert.deepEqual(buildMonthNavigation({ year: 2026, month: 12, current }), {
    previous: { year: 2026, month: 11 },
    next: { year: 2027, month: 1 },
  });
  assert.equal(buildMonthNavigation({ year: 2100, month: 12, current }).next, null);
});

test("월 이동 버튼은 모드·범위를 유지하고, 이번 달의 이전 달 버튼은 비활성이다", () => {
  const response = respond([session(1)], {
    year: 2026,
    month: 10,
    scope: "mine",
    navigation: buildMonthNavigation({ year: 2026, month: 10, current: { year: 2026, month: 10 } }),
  });
  const [link, previous, next] = response.components[0].toJSON().components;
  assert.equal(link.url, "https://example.test/calendar?date=2026-11-01");
  assert.equal(previous.disabled, true);
  assert.equal(next.custom_id, "trpg:session-check:v1:month:2026-11:detail:mine");
  assert.match(response.embeds[0].toJSON().title, /내 세션/);

  assert.deepEqual(parseSessionCheckCustomId(next.custom_id), {
    kind: "month",
    year: 2026,
    month: 11,
    mode: "detail",
    scope: "mine",
  });
  assert.deepEqual(parseSessionCheckCustomId("trpg:session-check:v1:detail"), { kind: "detail" });
  assert.equal(parseSessionCheckCustomId("trpg:session-check:v1:month:2025-13:detail:all"), null);
  assert.equal(isSessionCheckCustomId("trpg:music:v1:skip"), false);
});

test("세션 상세는 참가자 전체를 1024자 안에서 보여 주고 웹 세션 링크를 붙인다", () => {
  const many = {
    ...session(1, { participants: 60 }),
    _id: { toString: () => "session-1" },
  };
  const detail = buildSessionDetailResponse(many, "https://example.test");
  const field = detail.embeds[0].toJSON().fields.find((item) => item.name.startsWith("참가"));
  assert.equal(field.name, "참가 60명");
  assert.ok(field.value.length <= 1024, `length=${field.value.length}`);
  assert.match(field.value, /외 \d+명$/);
  assert.equal(
    detail.components[0].toJSON().components[0].url,
    "https://example.test/calendar?sessionId=session-1",
  );

  const empty = buildSessionDetailResponse(
    { ...session(2, { participants: 0 }), _id: { toString: () => "session-2" } },
    "https://example.test",
  );
  assert.match(
    empty.embeds[0].toJSON().fields.find((item) => item.name.startsWith("참가")).value,
    /아직 참가자가 없습니다/,
  );
});

test("웹 캘린더 링크는 조회한 달로 연다", () => {
  assert.equal(
    buildCalendarWebUrl({
      baseUrl: "https://example.test",
      year: 2026,
      month: 10,
      todayKey: "2026-10-22",
      isCurrentMonth: true,
    }),
    "https://example.test/calendar?date=2026-10-22",
  );
  assert.equal(
    buildCalendarWebUrl({
      baseUrl: "https://example.test",
      year: 2026,
      month: 12,
      todayKey: "2026-10-22",
      isCurrentMonth: false,
    }),
    "https://example.test/calendar?date=2026-12-01",
  );
});
