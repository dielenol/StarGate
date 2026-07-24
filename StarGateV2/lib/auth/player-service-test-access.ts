/**
 * 실제 플레이어 흐름을 운영 환경에서 검증하기 위한 전용 계정 정책.
 *
 * 이 정책은 페이지 준비중 상태, 영업시간, 라이선스·연구 해금처럼
 * 플레이어 서비스 사용을 막는 조건만 우회한다. RBAC/GM 권한, 타인 데이터 접근,
 * 소유권, 잔액, 재고, 멱등성 검증을 우회하는 용도로 사용하면 안 된다.
 */

interface PlayerServiceTestUser {
  username?: string | null;
  role?: string | null;
}

const PLAYER_SERVICE_TEST_USERNAMES = new Set(["JTEST"]);
const PLAYER_SERVICE_TEST_PATH_PREFIXES = [
  "/erp/shop",
  "/erp/stock",
  "/erp/equipment-shop/towaski",
  "/erp/equipment-shop/acheron",
  "/erp/equipment-shop/strategic",
  "/erp/equipment-shop/custom",
  "/erp/equipment-shop/simulator",
] as const;

export function hasPlayerServiceTestAccess(
  user: PlayerServiceTestUser | null | undefined,
): boolean {
  return Boolean(
    user?.role === "J" &&
      user.username &&
      PLAYER_SERVICE_TEST_USERNAMES.has(user.username),
  );
}

export function isPlayerServiceTestPath(pathname: string): boolean {
  return PLAYER_SERVICE_TEST_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function hasPlayerServiceTestPathAccess(
  user: PlayerServiceTestUser | null | undefined,
  pathname: string,
): boolean {
  return hasPlayerServiceTestAccess(user) && isPlayerServiceTestPath(pathname);
}

export function resolvePlayerServiceAvailability(
  available: boolean,
  user: PlayerServiceTestUser | null | undefined,
): boolean {
  return available || hasPlayerServiceTestAccess(user);
}
