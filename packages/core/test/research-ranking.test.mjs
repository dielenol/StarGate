import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResearchHallOfFameResponse,
  buildResearchRankingDiscordPayloads,
} from "../dist/domain/research-ranking.js";

test("연구 공로 응답은 내부 식별자와 기여 시각을 제거하고 TOP 3만 직렬화한다", () => {
  const generatedAt = new Date("2026-08-22T12:00:00.000Z");
  const response = buildResearchHallOfFameResponse(
    Array.from({ length: 4 }, (_, index) => ({
      contributorCharacterId: `private-${index}`,
      contributorCodename: `요원 ${index + 1}`,
      totalCredits: 4_000 - index * 1_000,
      contributionCount: index + 1,
      lastContributedAt: generatedAt,
    })),
    generatedAt,
  );

  assert.deepEqual(response, {
    period: "ALL_TIME",
    cadence: "DAILY_21_KST",
    generatedAt: generatedAt.toISOString(),
    items: [
      { rank: 1, codename: "요원 1", totalCredits: 4_000, contributionCount: 1 },
      { rank: 2, codename: "요원 2", totalCredits: 3_000, contributionCount: 2 },
      { rank: 3, codename: "요원 3", totalCredits: 2_000, contributionCount: 3 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(response), /private-|lastContributedAt/);
});

test("Discord 카드는 금·은·동, 누적 CR, 횟수, 링크를 표시하고 멘션을 비활성화한다", () => {
  const snapshot = buildResearchHallOfFameResponse(
    [
      {
        contributorCharacterId: "private-1",
        contributorCodename: "@everyone <@123>",
        totalCredits: 1_234,
        contributionCount: 7,
        lastContributedAt: new Date("2026-08-22T12:00:00.000Z"),
      },
      {
        contributorCharacterId: "private-2",
        contributorCodename: "SILVER",
        totalCredits: 1_000,
        contributionCount: 5,
        lastContributedAt: new Date("2026-08-22T11:00:00.000Z"),
      },
      {
        contributorCharacterId: "private-3",
        contributorCodename: "BRONZE",
        totalCredits: 900,
        contributionCount: 4,
        lastContributedAt: new Date("2026-08-22T10:00:00.000Z"),
      },
    ],
    new Date("2026-08-22T12:00:00.000Z"),
  );
  const [payload] = buildResearchRankingDiscordPayloads({
    snapshot,
    siteBaseUrl: "https://www.ordonet.co.kr",
  });

  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.match(payload.embeds[0].fields[0].name, /🥇 금상/);
  assert.match(payload.embeds[0].fields[0].name, /@​everyone <@​123>/);
  assert.match(payload.embeds[0].fields[0].value, /1,234 CR/);
  assert.match(payload.embeds[0].fields[0].value, /7회/);
  assert.match(payload.embeds[0].fields[1].name, /🥈 은상 · SILVER/);
  assert.match(payload.embeds[0].fields[1].value, /1,000 CR/);
  assert.match(payload.embeds[0].fields[2].name, /🥉 동상 · BRONZE/);
  assert.match(payload.embeds[0].fields[2].value, /900 CR/);
  assert.match(payload.embeds[0].fields[3].value, /연구 공로 시상대 보기/);
  assert.equal(payload.embeds[0].url, "https://www.ordonet.co.kr/erp/hall-of-fame");
  assert.deepEqual(
    buildResearchRankingDiscordPayloads({
      snapshot: { ...snapshot, items: [] },
      siteBaseUrl: "https://www.ordonet.co.kr",
    }),
    [],
  );
});
