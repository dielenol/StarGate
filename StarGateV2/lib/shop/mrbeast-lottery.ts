import { randomInt } from "node:crypto";

export const MRBEAST_SODA_SLUG = "mrbeast_soda";
export const MRBEAST_LOTTERY_SLUG = "mrbeast_lottery";
export const MRBEAST_LOTTERY_PRIZE_TABLE_VERSION = "mrbeast-lottery-v1";
export const MRBEAST_LOTTERY_TOTAL_BUCKETS = 1_000_000;
export const MRBEAST_LOTTERY_REVEAL_THRESHOLD = 0.65;

export const MRBEAST_LOTTERY_TIERS = [
  "blank",
  "fifth",
  "fourth",
  "third",
  "second",
  "first",
  "zeroth",
] as const;

export type MrBeastLotteryTier = (typeof MRBEAST_LOTTERY_TIERS)[number];

export interface MrBeastLotteryPrize {
  tier: MrBeastLotteryTier;
  label: string;
  bucketCount: number;
  reward: number;
  cumulativeExclusiveMax: number;
}

export interface MrBeastLotteryConfig {
  enabled: boolean;
  eventId: string | null;
  startAt: Date | null;
  endAt: Date | null;
  prizeTableVersion: typeof MRBEAST_LOTTERY_PRIZE_TABLE_VERSION;
}

export const MRBEAST_LOTTERY_PRIZES: readonly MrBeastLotteryPrize[] = [
  {
    tier: "blank",
    label: "꽝",
    bucketCount: 99_999,
    reward: 0,
    cumulativeExclusiveMax: 99_999,
  },
  {
    tier: "fifth",
    label: "5등",
    bucketCount: 450_000,
    reward: 40,
    cumulativeExclusiveMax: 549_999,
  },
  {
    tier: "fourth",
    label: "4등",
    bucketCount: 350_000,
    reward: 60,
    cumulativeExclusiveMax: 899_999,
  },
  {
    tier: "third",
    label: "3등",
    bucketCount: 90_000,
    reward: 80,
    cumulativeExclusiveMax: 989_999,
  },
  {
    tier: "second",
    label: "2등",
    bucketCount: 9_900,
    reward: 800,
    cumulativeExclusiveMax: 999_899,
  },
  {
    tier: "first",
    label: "1등",
    bucketCount: 100,
    reward: 10_000,
    cumulativeExclusiveMax: 999_999,
  },
  {
    tier: "zeroth",
    label: "0등",
    bucketCount: 1,
    reward: 100_000,
    cumulativeExclusiveMax: 1_000_000,
  },
] as const;

export const MRBEAST_LOTTERY_PRIZE_TABLES = {
  [MRBEAST_LOTTERY_PRIZE_TABLE_VERSION]: MRBEAST_LOTTERY_PRIZES,
} as const satisfies Readonly<
  Record<string, readonly MrBeastLotteryPrize[]>
>;

export function resolveMrBeastLotteryConfig(
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): MrBeastLotteryConfig {
  const enabledFlag = environment.MRBEAST_LOTTERY_ENABLED?.trim().toLowerCase();
  const eventId = environment.MRBEAST_LOTTERY_EVENT_ID?.trim() ?? "";
  const startAt = parseIsoEventDate(environment.MRBEAST_LOTTERY_START_AT);
  const endAt = parseIsoEventDate(environment.MRBEAST_LOTTERY_END_AT);
  const isWithinValidWindow =
    startAt !== null &&
    endAt !== null &&
    startAt.getTime() < endAt.getTime() &&
    now.getTime() >= startAt.getTime() &&
    now.getTime() < endAt.getTime();

  return {
    enabled:
      enabledFlag === "true" &&
      eventId.length > 0 &&
      isWithinValidWindow,
    eventId: eventId || null,
    startAt,
    endAt,
    prizeTableVersion: MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  };
}

function parseIsoEventDate(value: string | undefined): Date | null {
  const trimmed = value?.trim() ?? "";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(trimmed)
  ) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getMrBeastLotteryPrize(
  bucket: number,
  prizeTableVersion: string = MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
): MrBeastLotteryPrize {
  if (
    !Number.isSafeInteger(bucket) ||
    bucket < 0 ||
    bucket >= MRBEAST_LOTTERY_TOTAL_BUCKETS
  ) {
    throw new RangeError(`Lottery bucket is out of range: ${bucket}`);
  }

  const prizes = resolveMrBeastLotteryPrizeTable(prizeTableVersion);
  const prize = prizes.find(
    (entry) => bucket < entry.cumulativeExclusiveMax,
  );
  if (!prize) throw new Error("Lottery prize table does not cover the bucket");
  return prize;
}

export function resolveMrBeastLotteryPrizeTable(
  prizeTableVersion: string,
): readonly MrBeastLotteryPrize[] {
  const prizes =
    MRBEAST_LOTTERY_PRIZE_TABLES[
      prizeTableVersion as keyof typeof MRBEAST_LOTTERY_PRIZE_TABLES
    ];
  if (!prizes) {
    throw new Error(
      `Unknown MrBeast lottery prize table: ${prizeTableVersion}`,
    );
  }
  return prizes;
}

export function drawMrBeastLotteryPrize(
  drawBucket: (exclusiveMax: number) => number = randomInt,
  prizeTableVersion: string = MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
): { bucket: number; prize: MrBeastLotteryPrize } {
  const bucket = drawBucket(MRBEAST_LOTTERY_TOTAL_BUCKETS);
  return {
    bucket,
    prize: getMrBeastLotteryPrize(bucket, prizeTableVersion),
  };
}

export function isMrBeastLotteryAnnouncementCandidate(
  tier: MrBeastLotteryTier,
): boolean {
  return tier === "second" || tier === "first" || tier === "zeroth";
}
