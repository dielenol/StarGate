/**
 * `/일정 참여확인` 에페메랄 PNG 쿨다운 (메모리, 프로세스 단위)
 *
 * @module utils/participation-image-cooldown
 */

const lastImageAtByKey = new Map<string, number>();

export function participationImageCooldownKey(
  guildId: string,
  userId: string
): string {
  return `${guildId}:${userId}`;
}

/** 분 단위. 0이면 매 조회마다 이미지 시도(부하는 PNG 큐·간격으로 완화). */
export function getParticipationImageCooldownMs(): number {
  const v = process.env.PARTICIPATION_CHECK_IMAGE_COOLDOWN_MINUTES?.trim();
  const minutes = v !== undefined && v !== "" ? Number(v) : 30;
  const m = Number.isFinite(minutes) && minutes >= 0 ? minutes : 30;
  return Math.round(m * 60_000);
}

export function canIssueParticipationImage(key: string): boolean {
  const last = lastImageAtByKey.get(key);
  if (last === undefined) return true;
  return Date.now() - last >= getParticipationImageCooldownMs();
}

export function markParticipationImageIssued(key: string): void {
  lastImageAtByKey.set(key, Date.now());
}

/** 다음 이미지까지 남은 ms (없으면 0) */
export function msUntilNextParticipationImage(key: string): number {
  const last = lastImageAtByKey.get(key);
  if (last === undefined) return 0;
  const elapsed = Date.now() - last;
  const need = getParticipationImageCooldownMs();
  return Math.max(0, need - elapsed);
}
