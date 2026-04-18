/**
 * 사용자별 1회 안내(튜토리얼) 기록
 */

import { MongoServerError } from "mongodb";
import { userTipsCol } from "../collections.js";

/** `/참여확인` 튜토리얼 에페메랄 */
export const TIP_PARTICIPATION_CHECK = "participation_check_intro" as const;

export async function hasParticipationCheckTipBeenShown(
  guildId: string,
  userId: string
): Promise<boolean> {
  const col = await userTipsCol();
  const doc = await col.findOne({
    guildId,
    userId,
    tipId: TIP_PARTICIPATION_CHECK,
  });
  return doc !== null;
}

/** 안내를 보낸 뒤 호출. 중복 삽입은 무시. */
export async function recordParticipationCheckTipShown(
  guildId: string,
  userId: string
): Promise<void> {
  const col = await userTipsCol();
  try {
    await col.insertOne({
      guildId,
      userId,
      tipId: TIP_PARTICIPATION_CHECK,
      createdAt: new Date(),
    });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11_000) return;
    throw e;
  }
}
