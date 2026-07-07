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
      contributorCharacterId: "char-a",
      contributorCodename: "아그네타",
      amount: 100,
      createdAt: "2026-07-07T01:00:00.000Z",
    },
    {
      contributorCharacterId: "char-b",
      contributorCodename: "노바",
      amount: 250,
      createdAt: "2026-07-07T02:00:00.000Z",
    },
    {
      contributorCharacterId: "char-a",
      contributorCodename: "아그네타",
      amount: 200,
      createdAt: "2026-07-07T03:00:00.000Z",
    },
    {
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
});
