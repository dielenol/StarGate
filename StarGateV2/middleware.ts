/**
 * Edge Runtime 경량 미들웨어
 *
 * mongodb 드라이버는 Edge Runtime에서 사용 불가하므로,
 * 여기서는 세션 쿠키 존재 여부만 확인하여 빠른 리다이렉트 처리.
 * 실제 인증·RBAC 검증은 (erp)/layout.tsx 및 각 페이지의 서버 컴포넌트에서 수행.
 */

import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import { safeCallbackUrl } from "@/lib/auth/callback-url";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => request.cookies.get(name)?.value,
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    const next = safeCallbackUrl(request.nextUrl.pathname);
    // 디폴트 폴백("/erp")인 경우는 query 생략 — login page 도 동일 디폴트.
    if (next !== "/erp") {
      loginUrl.searchParams.set("callbackUrl", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/erp/:path*"],
};
