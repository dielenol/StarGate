import "server-only";

import { randomInt } from "node:crypto";

import {
  getMrBeastLotteryPrize,
  MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  MRBEAST_LOTTERY_TOTAL_BUCKETS,
} from "@/lib/shop/mrbeast-lottery";
import type { MrBeastLotteryPrize } from "@/lib/shop/mrbeast-lottery";

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
