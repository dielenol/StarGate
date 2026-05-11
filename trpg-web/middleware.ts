/**
 * Edge Runtime 경량 미들웨어.
 *
 * mongodb 드라이버는 Edge Runtime 에서 사용 불가하므로, 여기서는
 * 세션 쿠키 존재 여부만 확인하고 실제 인증·길드 멤버 검증은
 * 서버 컴포넌트 / API 라우트의 `auth()` 호출에서 수행한다.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
] as const;

export function middleware(request: NextRequest) {
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
  // /login, /api/auth (next-auth), 정적 자원, favicon 을 제외한 전체 경로 가드.
  // 향후 추가되는 보호 경로를 누락하지 않기 위한 negative pattern.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
