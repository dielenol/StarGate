/**
 * 병기부(ARMORY_BUREAU) 운영 중지 스위치.
 *
 * 기본값은 "중지"다. 웹(StarGateV2)과 worker 양쪽 환경에
 * `ARMORY_BUREAU_ENABLED=true` 를 명시해야 병기부 화면·API·알림 발송이 다시 열린다.
 * 코드 배포와 운영 재개를 분리하기 위해 `RESEARCH_LAB_WORKER_ENABLED` 와 같은 방식을 쓴다.
 */
export const ARMORY_BUREAU_ENABLED_ENV = "ARMORY_BUREAU_ENABLED";

export const ARMORY_BUREAU_SUSPENDED_CODE = "ARMORY_BUREAU_SUSPENDED";

export const ARMORY_BUREAU_SUSPENDED_MESSAGE =
  "병기부 기능은 현재 운영 중지 상태입니다.";

/** 병기부 사이드바 항목과 하위 구역이 공유하는 운영 잠금 키 접두사. */
export const ARMORY_BUREAU_LOCK_KEY_PREFIX = "/erp/equipment-shop";

export function isArmoryBureauSuspended(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[ARMORY_BUREAU_ENABLED_ENV]?.trim().toLowerCase() !== "true";
}

export function isArmoryBureauLockKey(lockKey: string): boolean {
  return (
    lockKey === ARMORY_BUREAU_LOCK_KEY_PREFIX ||
    lockKey.startsWith(`${ARMORY_BUREAU_LOCK_KEY_PREFIX}/`)
  );
}

/**
 * 중지 중에는 병기부 잠금 키를 운영 override 와 무관하게 잠금으로 고정한다.
 * 중지 상태가 아니면 override 를 그대로 돌려준다.
 */
export function applyArmoryBureauSuspensionToLocks(
  overrides: Readonly<Record<string, boolean>>,
  lockKeys: readonly string[],
  suspended: boolean,
): Record<string, boolean> {
  if (!suspended) return { ...overrides };
  const forced = Object.fromEntries(
    [...Object.keys(overrides), ...lockKeys]
      .filter(isArmoryBureauLockKey)
      .map((lockKey) => [lockKey, true] as const),
  );
  return { ...overrides, ...forced };
}
