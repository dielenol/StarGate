/**
 * 경량 Proxy (Next 16 proxy — Node.js 런타임).
 *
 * 세션 쿠키 존재 여부만 확인한다. 토큰 검증은 서버 컴포넌트 / API 라우트의 `auth()`가 하고,
 * 길드 멤버 검증은 로그인 시점(`lib/auth/config.ts` signIn 콜백)에만 한다 — 이후 탈퇴는 JWT 만료 전까지 반영되지 않는다.
 * 쿠키 이름은 환경(NODE_ENV)에 따라 달라진다 — `lib/auth/cookies.ts` 참조.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAMES } from "@/lib/auth/cookies";

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => request.cookies.get(name)?.value,
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // /login, /privacy, /api/auth (next-auth), 정적 자원, public assets, favicon 제외.
  // 향후 추가되는 보호 경로를 누락하지 않기 위한 negative pattern.
  matcher: [
    "/((?!login|privacy|api/auth|_next/static|_next/image|assets|favicon.ico).*)",
  ],
};
