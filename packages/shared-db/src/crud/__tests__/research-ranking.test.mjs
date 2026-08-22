import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamResearchContributionRankings } from "../../../dist/index.js";

test("1,000건을 넘는 전체 기간 모금·가속만 누적한다", () => {
  const oldContributions = Array.from({ length: 1_005 }, (_, index) => ({
    _id: `old-${String(index).padStart(4, "0")}`,
    scope: "team",
    action: index % 2 === 0 ? "fund" : "rush",
    contributorCharacterId: "character-old",
    contributorCodename: "올드가드",
    amount: 1,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  }));
  const excluded = [
    { ...oldContributions[0], _id: "personal", scope: "personal", amount: 99_999 },
    { ...oldContributions[0], _id: "start", action: "start", amount: 99_999 },
    { ...oldContributions[0], _id: "apply", action: "apply", amount: 99_999 },
    { ...oldContributions[0], _id: "zero", amount: 0 },
  ];

  assert.deepEqual(
    buildTeamResearchContributionRankings([...oldContributions, ...excluded]),
    [
      {
        contributorCharacterId: "character-old",
        contributorCodename: "올드가드",
        totalCredits: 1_005,
        contributionCount: 1_005,
        lastContributedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ],
  );
});

test("동률은 최근 기여 시각과 내부 캐릭터 ID로 결정하고 최신 codename을 쓴다", () => {
  const rows = buildTeamResearchContributionRankings([
    {
      _id: "001",
      scope: "team",
      action: "fund",
      contributorCharacterId: "character-b",
      contributorCodename: "이전 이름",
      amount: 50,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
    },
    {
      _id: "003",
      scope: "team",
      action: "rush",
      contributorCharacterId: "character-b",
      contributorCodename: "최신 이름",
      amount: 50,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    },
    {
      _id: "002",
      scope: "team",
      action: "fund",
      contributorCharacterId: "character-b",
      contributorCodename: "동시각 이전 ID",
      amount: 0.1,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    },
    {
      _id: "a",
      scope: "team",
      action: "fund",
      contributorCharacterId: "character-a",
      contributorCodename: "알파",
      amount: 100.1,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    },
    {
      _id: "c",
      scope: "team",
      action: "fund",
      contributorCharacterId: "character-c",
      contributorCodename: "찰리",
      amount: 100.1,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    },
  ]);

  assert.deepEqual(
    rows.map((row) => [row.contributorCharacterId, row.contributorCodename]),
    [
      ["character-a", "알파"],
      ["character-b", "최신 이름"],
      ["character-c", "찰리"],
    ],
  );
});
