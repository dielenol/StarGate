/**
 * 캐릭터 자가편집 쿨다운 (P6)
 *
 * `character_change_logs` 의 actor 별 최근 N시간 기록 수를 기반으로
 * 플레이어 자가편집을 throttle. admin(V+) 은 쿨다운 미적용.
 *
 * 환경변수 (.env):
 *   - CHARACTER_EDIT_COOLDOWN_MAX            (기본 10)
 *   - CHARACTER_EDIT_COOLDOWN_WINDOW_HOURS   (기본 24)
 *
 * 운영 메모: window 시작점은 "now - windowMs" 의 슬라이딩 윈도. resetAt 은
 * 프론트 표시 편의를 위해 "지금 + windowMs" 로 계산해 사용자가 보는 24h
 * 카운트다운과 일치시킨다 (정확한 oldest-log + windowMs 가 아님 — 의도된 단순화).
 */

import { countRecentChangesByActor } from "@stargate/shared-db";

export interface CooldownConfig {
  windowHours: number;
  maxCount: number;
}

export interface CooldownStatus {
  /** false 면 PATCH 허용 안 됨 (429 응답). */
  allowed: boolean;
  /** windowHours 동안 사용한 변경 시도 수 (revert 포함). */
  used: number;
  /** maxCount - used (음수면 0). */
  remaining: number;
  /** 클라이언트에 표시할 다음 리셋 시각 — 단순화된 슬라이딩 카운트다운. */
  resetAt: Date;
  windowHours: number;
  maxCount: number;
}

/**
 * 환경변수 → CooldownConfig. 잘못된 값이면 기본값으로 fallback.
 * 0 / NaN / 음수는 모두 기본값으로 처리해 "무제한" 같은 구멍 방지.
 */
export function getCooldownConfig(): CooldownConfig {
  const rawWindow = Number(process.env.CHARACTER_EDIT_COOLDOWN_WINDOW_HOURS);
  const rawMax = Number(process.env.CHARACTER_EDIT_COOLDOWN_MAX);
  const windowHours =
    Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : 24;
  const maxCount = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 10;
  return { windowHours, maxCount };
}

export async function checkEditCooldown(
  actorId: string,
): Promise<CooldownStatus> {
  const { windowHours, maxCount } = getCooldownConfig();
  const windowMs = windowHours * 60 * 60 * 1000;

  const used = await countRecentChangesByActor(actorId, windowMs);
  const remaining = Math.max(0, maxCount - used);
  const resetAt = new Date(Date.now() + windowMs);

  return {
    allowed: used < maxCount,
    used,
    remaining,
    resetAt,
    windowHours,
    maxCount,
  };
}
