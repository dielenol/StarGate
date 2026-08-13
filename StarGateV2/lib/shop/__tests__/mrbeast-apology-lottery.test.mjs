import assert from "node:assert/strict";
import test from "node:test";

import {
  getMrBeastLotteryPrize,
  getMrBeastLotteryTicketDefinition,
  getMrBeastLotteryTicketSlugForPrizeTableVersion,
  isMrBeastLotteryTicketSlug,
  MRBEAST_APOLOGY_LOTTERY_NAME,
  MRBEAST_APOLOGY_LOTTERY_PRIZES,
  MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
  MRBEAST_APOLOGY_LOTTERY_SLUG,
  MRBEAST_LOTTERY_PRIZES,
  MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  MRBEAST_LOTTERY_SLUG,
  MRBEAST_LOTTERY_TOTAL_BUCKETS,
  resolveMrBeastLotteryPrizeTable,
} from "../mrbeast-lottery.ts";

test("사죄 복권 1,000,000 버킷 확률표의 수량과 경계가 정확하다", () => {
  assert.deepEqual(
    MRBEAST_APOLOGY_LOTTERY_PRIZES.map(
      ({ tier, bucketCount, reward }) => ({ tier, bucketCount, reward }),
    ),
    [
      { tier: "blank", bucketCount: 9_990, reward: 0 },
      { tier: "fifth", bucketCount: 450_000, reward: 40 },
      { tier: "fourth", bucketCount: 350_000, reward: 60 },
      { tier: "third", bucketCount: 90_000, reward: 80 },
      { tier: "second", bucketCount: 99_000, reward: 800 },
      { tier: "first", bucketCount: 1_000, reward: 10_000 },
      { tier: "zeroth", bucketCount: 10, reward: 100_000 },
    ],
  );
  assert.equal(
    MRBEAST_APOLOGY_LOTTERY_PRIZES.reduce(
      (sum, prize) => sum + prize.bucketCount,
      0,
    ),
    MRBEAST_LOTTERY_TOTAL_BUCKETS,
  );

  const boundaries = [
    [0, "blank"],
    [9_989, "blank"],
    [9_990, "fifth"],
    [459_989, "fifth"],
    [459_990, "fourth"],
    [809_989, "fourth"],
    [809_990, "third"],
    [899_989, "third"],
    [899_990, "second"],
    [998_989, "second"],
    [998_990, "first"],
    [999_989, "first"],
    [999_990, "zeroth"],
    [999_999, "zeroth"],
  ];
  for (const [bucket, tier] of boundaries) {
    assert.equal(
      getMrBeastLotteryPrize(
        bucket,
        MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
      ).tier,
      tier,
      String(bucket),
    );
  }

  const expectedValue =
    MRBEAST_APOLOGY_LOTTERY_PRIZES.reduce(
      (sum, prize) => sum + prize.bucketCount * prize.reward,
      0,
    ) / MRBEAST_LOTTERY_TOTAL_BUCKETS;
  assert.equal(expectedValue, 136.4);

  for (const tier of ["second", "first", "zeroth"]) {
    const normal = MRBEAST_LOTTERY_PRIZES.find(
      (prize) => prize.tier === tier,
    );
    const apology = MRBEAST_APOLOGY_LOTTERY_PRIZES.find(
      (prize) => prize.tier === tier,
    );
    assert.ok(normal && apology);
    assert.equal(apology.bucketCount, normal.bucketCount * 10, tier);
  }
});

test("기존 복권 표는 유지하고 ticket definition과 버전 registry를 양방향 조회한다", () => {
  assert.equal(
    resolveMrBeastLotteryPrizeTable(MRBEAST_LOTTERY_PRIZE_TABLE_VERSION),
    MRBEAST_LOTTERY_PRIZES,
  );
  assert.equal(
    resolveMrBeastLotteryPrizeTable(
      MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
    ),
    MRBEAST_APOLOGY_LOTTERY_PRIZES,
  );

  assert.equal(isMrBeastLotteryTicketSlug(MRBEAST_LOTTERY_SLUG), true);
  assert.equal(
    isMrBeastLotteryTicketSlug(MRBEAST_APOLOGY_LOTTERY_SLUG),
    true,
  );
  assert.equal(isMrBeastLotteryTicketSlug("unknown_lottery"), false);
  assert.deepEqual(
    getMrBeastLotteryTicketDefinition(MRBEAST_APOLOGY_LOTTERY_SLUG),
    {
      slug: MRBEAST_APOLOGY_LOTTERY_SLUG,
      name: MRBEAST_APOLOGY_LOTTERY_NAME,
      prizeTableVersion: MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
    },
  );
  assert.equal(
    getMrBeastLotteryTicketSlugForPrizeTableVersion(
      MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
    ),
    MRBEAST_APOLOGY_LOTTERY_SLUG,
  );
  assert.equal(
    getMrBeastLotteryTicketSlugForPrizeTableVersion("unknown-version"),
    undefined,
  );
});
