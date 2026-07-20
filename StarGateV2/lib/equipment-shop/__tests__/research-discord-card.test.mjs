import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateResearchDiscordContributions,
  buildResearchDiscordCardPayload,
} from "../research-discord-card.ts";

test("연구비와 가속 투입을 기여자별로 분리 합산한다", () => {
  const totals = aggregateResearchDiscordContributions([
    {
      action: "fund",
      contributorCharacterId: "time",
      contributorCodename: "TIME",
      amount: 100,
      createdAt: "2026-07-20T01:00:00.000Z",
    },
    {
      action: "fund",
      contributorCharacterId: "time",
      contributorCodename: "TIME",
      amount: 200,
      createdAt: "2026-07-20T02:00:00.000Z",
    },
    {
      action: "rush",
      contributorCharacterId: "time",
      contributorCodename: "TIME",
      amount: 80,
      rushHours: 24,
      createdAt: "2026-07-20T03:00:00.000Z",
    },
    {
      action: "start",
      contributorCharacterId: "time",
      contributorCodename: "TIME",
      amount: 0,
      createdAt: "2026-07-20T04:00:00.000Z",
    },
    {
      action: "apply",
      contributorCharacterId: "system",
      contributorCodename: "연구소 자동 적용",
      amount: 0,
      createdAt: "2026-07-20T05:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    totals.funding.map((row) => ({ id: row.contributorCharacterId, amount: row.amount })),
    [{ id: "time", amount: 300 }],
  );
  assert.deepEqual(
    totals.rush.map((row) => ({
      id: row.contributorCharacterId,
      amount: row.amount,
      hours: row.rushHours,
    })),
    [{ id: "time", amount: 80, hours: 24 }],
  );
});

test("현황 카드는 전체 진행과 분리된 기여 장부를 한 임베드에 담는다", () => {
  const payload = buildResearchDiscordCardPayload({
    projectKey: "BIO-02",
    projectName: "생체 방호 프로토콜",
    targetCost: 300,
    fundedAmount: 300,
    fundingStatus: "started",
    project: {
      status: "in_progress",
      completedAt: new Date("2026-07-28T03:00:00.000Z"),
    },
    contributions: [
      {
        action: "fund",
        contributorCharacterId: "time",
        contributorCodename: "TIME",
        amount: 200,
        createdAt: "2026-07-20T01:00:00.000Z",
      },
      {
        action: "fund",
        contributorCharacterId: "maria",
        contributorCodename: "MARIA @everyone",
        amount: 100,
        createdAt: "2026-07-20T02:00:00.000Z",
      },
      {
        action: "rush",
        contributorCharacterId: "time",
        contributorCodename: "TIME",
        amount: 80,
        rushHours: 24,
        createdAt: "2026-07-20T03:00:00.000Z",
      },
    ],
    updatedAt: new Date("2026-07-20T04:00:00.000Z"),
    labUrl: "https://example.test/erp/equipment-shop/lab",
  });

  const embed = payload.embeds[0];
  assert.equal(embed.title, "팀 연구 · BIO-02 — 생체 방호 프로토콜");
  assert.equal(embed.fields.find((field) => field.name === "진행")?.value, "300 / 300 CR");
  assert.match(embed.fields.find((field) => field.name === "연구비 기여")?.value ?? "", /TIME.*200 CR/);
  assert.match(embed.fields.find((field) => field.name === "가속 투입")?.value ?? "", /80 CR · 24시간 단축/);
  assert.doesNotMatch(JSON.stringify(payload), /@everyone/);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("기여자가 많아도 Discord field 제한 안에서 외 N명으로 줄인다", () => {
  const contributions = Array.from({ length: 80 }, (_, index) => ({
    action: "fund",
    contributorCharacterId: `character-${index}`,
    contributorCodename: `LONG-CODENAME-${index}-${"X".repeat(30)}`,
    amount: 1000 - index,
    createdAt: new Date(1_700_000_000_000 + index),
  }));
  const payload = buildResearchDiscordCardPayload({
    projectKey: "BIO-01",
    projectName: "대규모 기여자 시험",
    targetCost: 100_000,
    fundedAmount: 10_000,
    fundingStatus: "funding",
    contributions,
    updatedAt: new Date("2026-07-20T04:00:00.000Z"),
    labUrl: "https://example.test/erp/equipment-shop/lab",
  });
  const value = payload.embeds[0].fields.find(
    (field) => field.name === "연구비 기여",
  )?.value;

  assert.ok(value);
  assert.ok(value.length <= 1000);
  assert.match(value, /외 \d+명/);
});
