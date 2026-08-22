import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildResearchContributionRankings,
  clampTeamResearchContribution,
} from "../research-contributions.ts";

test("team research contribution is capped by remaining target cost", () => {
  assert.equal(
    clampTeamResearchContribution({
      targetCost: 500,
      fundedAmount: 420,
      requestedAmount: 200,
    }),
    80,
  );
  assert.equal(
    clampTeamResearchContribution({
      targetCost: 500,
      fundedAmount: 500,
      requestedAmount: 50,
    }),
    0,
  );
  assert.equal(
    clampTeamResearchContribution({
      targetCost: 500,
      fundedAmount: 100,
      requestedAmount: 0,
    }),
    0,
  );
});

test("contribution rankings aggregate by character and sort by total amount", () => {
  const rankings = buildResearchContributionRankings([
    {
      contributionId: "0001",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-a",
      contributorCodename: "아그네타",
      amount: 100,
      createdAt: "2026-07-07T01:00:00.000Z",
    },
    {
      contributionId: "0002",
      scope: "team",
      action: "rush",
      contributorCharacterId: "char-b",
      contributorCodename: "노바",
      amount: 250,
      createdAt: "2026-07-07T02:00:00.000Z",
    },
    {
      contributionId: "0003",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-a",
      contributorCodename: "아그네타",
      amount: 200,
      createdAt: "2026-07-07T03:00:00.000Z",
    },
    {
      contributionId: "0004",
      scope: "team",
      action: "apply",
      contributorCharacterId: "system",
      contributorCodename: "연구소 자동 적용",
      amount: 0,
      createdAt: "2026-07-07T04:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    rankings.map((row) => ({
      id: row.contributorCharacterId,
      amount: row.totalAmount,
      count: row.contributionCount,
    })),
    [
      { id: "char-a", amount: 300, count: 2 },
      { id: "char-b", amount: 250, count: 1 },
    ],
  );
  assert.deepEqual(Object.keys(rankings[0]).sort(), [
    "contributionCount",
    "contributorCharacterId",
    "contributorCodename",
    "lastContributedAt",
    "totalAmount",
  ]);
});

test("contribution rankings cover the full ledger and exclude non-award events", () => {
  const ledger = Array.from({ length: 1_005 }, (_, index) => ({
    contributionId: String(index).padStart(4, "0"),
    scope: "team",
    action: index % 2 === 0 ? "fund" : "rush",
    contributorCharacterId: "char-all-time",
    contributorCodename: "아카이브",
    amount: 1,
    createdAt: new Date(2026, 0, 1, 0, 0, index),
  }));
  ledger.push(
    {
      contributionId: "skip-start",
      scope: "team",
      action: "start",
      contributorCharacterId: "char-all-time",
      contributorCodename: "아카이브",
      amount: 100,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    {
      contributionId: "skip-zero",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-all-time",
      contributorCodename: "아카이브",
      amount: 0,
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
    },
    {
      contributionId: "skip-personal",
      scope: "personal",
      action: "fund",
      contributorCharacterId: "char-all-time",
      contributorCodename: "아카이브",
      amount: 100,
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
    },
  );

  const [ranking] = buildResearchContributionRankings(ledger);
  assert.equal(ranking.totalAmount, 1_005);
  assert.equal(ranking.contributionCount, 1_005);
});

test("latest codename and tied ranks are deterministic", () => {
  const rankings = buildResearchContributionRankings([
    {
      contributionId: "0001",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-b",
      contributorCodename: "이전 이름",
      amount: 50,
      createdAt: "2026-08-20T12:00:00.000Z",
    },
    {
      contributionId: "0003",
      scope: "team",
      action: "rush",
      contributorCharacterId: "char-b",
      contributorCodename: "최신 이름",
      amount: 50,
      createdAt: "2026-08-21T12:00:00.000Z",
    },
    {
      contributionId: "0002",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-a",
      contributorCodename: "동률 A",
      amount: 100,
      createdAt: "2026-08-21T12:00:00.000Z",
    },
    {
      contributionId: "0004",
      scope: "team",
      action: "fund",
      contributorCharacterId: "char-c",
      contributorCodename: "같은 시각 이전",
      amount: 40,
      createdAt: "2026-08-22T12:00:00.000Z",
    },
    {
      contributionId: "0005",
      scope: "team",
      action: "rush",
      contributorCharacterId: "char-c",
      contributorCodename: "같은 시각 최신",
      amount: 60,
      createdAt: "2026-08-22T12:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    rankings.map((row) => [
      row.contributorCharacterId,
      row.contributorCodename,
    ]),
    [
      ["char-c", "같은 시각 최신"],
      ["char-a", "동률 A"],
      ["char-b", "최신 이름"],
    ],
  );
});
