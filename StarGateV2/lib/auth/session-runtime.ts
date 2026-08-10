const AUTH_SESSION_COOKIE = "authjs.session-token";
const SECURE_AUTH_SESSION_COOKIE = `__Secure-${AUTH_SESSION_COOKIE}`;

interface AuthEnvironment {
  [key: string]: string | undefined;
}

interface SessionCookieContext {
  authUrl?: string;
  forwardedProto?: string | null;
  requestProtocol: string;
}

function usable(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "undefined" && normalized !== "null";
}

/**
 * Auth.js core의 secret rotation 순서와 동일하게 최신 번호 secret부터 반환한다.
 * 기본 secret은 기존 세션 복호화를 위해 마지막 fallback으로 유지한다.
 */
export function readAuthSecrets(
  env: AuthEnvironment = process.env,
): string[] {
  const values = [
    env.AUTH_SECRET_3,
    env.AUTH_SECRET_2,
    env.AUTH_SECRET_1,
    env.AUTH_SECRET ?? env.NEXTAUTH_SECRET,
  ].filter(usable);

  return [...new Set(values)];
}

/**
 * Auth.js가 요청 URL에서 선택하는 session cookie 이름을 그대로 계산한다.
 * AUTH_URL이 있으면 NextAuth의 reqWithEnvURL 동작처럼 실제 요청보다 우선한다.
 */
export function resolveAuthSessionCookieName({
  authUrl,
  forwardedProto,
  requestProtocol,
}: SessionCookieContext): string {
  let protocol = requestProtocol;

  if (usable(authUrl)) {
    try {
      protocol = new URL(authUrl).protocol;
    } catch {
      // NextAuth도 잘못된 AUTH_URL은 요청 URL로 폴백한다.
    }
  } else if (forwardedProto) {
    const firstForwardedProtocol = forwardedProto.split(",", 1)[0]?.trim();
    if (firstForwardedProtocol) {
      protocol = firstForwardedProtocol.endsWith(":")
        ? firstForwardedProtocol
        : `${firstForwardedProtocol}:`;
    }
  }

  return protocol === "https:"
    ? SECURE_AUTH_SESSION_COOKIE
    : AUTH_SESSION_COOKIE;
}
