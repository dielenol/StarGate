/** DB 레코드를 만들지 않는 ERP 게스트 미리보기 신원. */
export const ERP_GUEST_USER = {
  id: "erp-guest-preview",
  username: "GUEST",
  displayName: "게스트",
  role: "U",
  discordId: null,
  isGuest: true,
} as const;

/**
 * 소유 데이터 조회에 사용할 수 있는 실제 사용자 ID만 반환한다.
 * 게스트 JWT의 합성 ID는 감사/세션 식별용일 뿐 DB owner 조회에는 절대 쓰지 않는다.
 */
export function getOwnedDataViewerId(user: {
  id: string;
  isGuest?: boolean;
}): string | null {
  return user.isGuest === true ? null : user.id;
}

/** 계정 회원에게만 허용되는 ERP 콘텐츠를 볼 수 있는 세션인지 판정한다. */
export function isMemberErpViewer(user: { isGuest?: boolean }): boolean {
  return user.isGuest !== true;
}

export const GUEST_READ_ONLY_ERROR_CODE = "GUEST_READ_ONLY";

const SAFE_ERP_API_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const GUEST_BLOCKED_GET_PATHS = new Set([
  "/api/erp/account/discord/link/start",
  "/api/erp/account/discord/link/callback",
  "/api/erp/equipment-shop/license-test",
]);

function isErpApiPath(pathname: string): boolean {
  return pathname === "/api/erp" || pathname.startsWith("/api/erp/");
}

/**
 * 게스트에게 허용할 수 없는 ERP API 요청인지 판정한다.
 * 일반 조회 메서드는 허용하되, OAuth 연동처럼 GET으로 시작하는 상태 변경 흐름도
 * 명시적으로 차단한다.
 */
export function isGuestRestrictedErpRequest(
  pathname: string,
  method: string,
): boolean {
  if (!isErpApiPath(pathname)) return false;
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (GUEST_BLOCKED_GET_PATHS.has(normalizedPathname)) return true;
  if (
    normalizedPathname.startsWith("/api/erp/characters/") &&
    normalizedPathname.endsWith("/edit-quota")
  ) {
    return true;
  }
  return !SAFE_ERP_API_METHODS.has(method.toUpperCase());
}
