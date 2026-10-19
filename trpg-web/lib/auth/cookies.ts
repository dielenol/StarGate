/**
 * Auth.js 쿠키 이름 정의 — proxy.ts와 Auth 설정이 함께 쓴다 (의존성 없음).
 *
 * 개발 환경은 StarGateV2 dev 서버와 같은 `localhost` 호스트를 쓰므로(포트는 쿠키 범위에
 * 포함되지 않음) Auth.js 기본 이름(`authjs.session-token` 등)이 두 앱 사이에서 서로 덮어써진다.
 * 그 결과 한쪽에 로그인하면 다른 쪽 세션이 풀리고(JWTSessionError), Discord 콜백이 상대 앱이
 * 쓴 PKCE 쿠키를 읽어 "인증 설정 오류"(InvalidCheck)로 실패한다.
 * 분기 기준은 NODE_ENV다. `next dev`·테스트(NODE_ENV !== "production")에서만 앱 전용 이름을 쓰고,
 * 운영 빌드는 Auth.js 기본 이름을 유지한다(HTTPS면 `__Secure-` 접두, csrf는 `__Host-` 접두).
 * 로컬에서 `next start`(http)로 띄우면 기본 이름이라 StarGateV2 dev와 여전히 충돌한다.
 */

const DEV_COOKIE_PREFIX = "trpg-web.";

export const USE_DEV_COOKIE_NAMES = process.env.NODE_ENV !== "production";

/** NextAuth `cookies` 옵션 — 이름만 덮어쓰고 secure/sameSite 등 속성은 기본값을 따른다. */
export const DEV_AUTH_COOKIES = {
  sessionToken: { name: `${DEV_COOKIE_PREFIX}session-token` },
  callbackUrl: { name: `${DEV_COOKIE_PREFIX}callback-url` },
  csrfToken: { name: `${DEV_COOKIE_PREFIX}csrf-token` },
  pkceCodeVerifier: { name: `${DEV_COOKIE_PREFIX}pkce.code_verifier` },
  state: { name: `${DEV_COOKIE_PREFIX}state` },
  nonce: { name: `${DEV_COOKIE_PREFIX}nonce` },
} as const;

/** proxy.ts가 세션 존재 여부를 빠르게 판단할 때 확인하는 세션 쿠키 이름. */
export const SESSION_COOKIE_NAMES: readonly string[] = USE_DEV_COOKIE_NAMES
  ? [DEV_AUTH_COOKIES.sessionToken.name]
  : [
      "authjs.session-token",
      "__Secure-authjs.session-token",
      "__Host-authjs.session-token",
    ];
