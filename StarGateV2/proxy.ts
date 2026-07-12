/**
 * Edge Runtime 경량 프록시
 *
 * mongodb 드라이버는 Edge Runtime에서 사용할 수 없으므로,
 * 여기서는 세션 쿠키 존재 여부만 확인하여 빠른 리다이렉트 처리.
 * 실제 인증·RBAC 검증은 (erp)/layout.tsx 및 각 페이지의 서버 컴포넌트에서 수행.
 */

import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { shouldBypassPageLocks } from "@/lib/erp/local-page-lock-bypass";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => request.cookies.get(name)?.value,
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    const next = safeCallbackUrl(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    // 디폴트 폴백("/erp")인 경우는 query 생략 — login page 도 동일 디폴트.
    if (next !== "/erp") {
      loginUrl.searchParams.set("callbackUrl", next);
    }
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-stargate-erp-pathname", request.nextUrl.pathname);
  requestHeaders.set(
    "x-stargate-erp-local-access",
    shouldBypassPageLocks({
      hostname: request.nextUrl.hostname,
      nodeEnv: process.env.NODE_ENV,
    })
      ? "1"
      : "0",
  );

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // `/erp/:path*` 만으로는 path-to-regexp 동작 차이로 `/erp` 자체가 누락될 수 있어
  // 명시적으로 두 패턴 등록. 가드 우회 (인증 없이 대시보드 접근) 사고 방지.
  matcher: ["/erp", "/erp/:path*"],
};
