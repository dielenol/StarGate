/**
 * Edge Runtime 경량 프록시
 *
 * mongodb 드라이버는 Edge Runtime에서 사용할 수 없으므로,
 * 여기서는 세션 쿠키 존재 여부만 확인하여 빠른 리다이렉트 처리.
 * 실제 인증·RBAC 검증은 (erp)/layout.tsx 및 각 페이지의 서버 컴포넌트에서 수행.
 */

import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

import { safeCallbackUrl } from "@/lib/auth/callback-url";
import {
  GUEST_READ_ONLY_ERROR_CODE,
  isGuestRestrictedErpRequest,
} from "@/lib/auth/guest";
import {
  readAuthSecrets,
  resolveAuthSessionCookieName,
} from "@/lib/auth/session-runtime";
import { buildTrustedErpRequestHeaders } from "@/lib/erp/local-page-lock-bypass";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

function hasCookieOrChunk(request: NextRequest, cookieName: string): boolean {
  return request.cookies
    .getAll()
    .some(
      ({ name, value }) =>
        value.length > 0 && (name === cookieName || name.startsWith(`${cookieName}.`)),
    );
}

async function readSessionToken(request: NextRequest) {
  const secrets = readAuthSecrets();
  if (secrets.length === 0) {
    return { status: "missing-secret" as const, token: null };
  }

  const cookieName = resolveAuthSessionCookieName({
    authUrl: process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    requestProtocol: request.nextUrl.protocol,
  });
  if (!hasCookieOrChunk(request, cookieName)) {
    return { status: "invalid" as const, token: null };
  }

  const token = await getToken({
    req: request,
    secret: secrets,
    cookieName,
    salt: cookieName,
  });
  if (token) return { status: "valid" as const, token };

  return { status: "invalid" as const, token: null };
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isErpPage = pathname === "/erp" || pathname.startsWith("/erp/");
  const isErpApi = pathname === "/api/erp" || pathname.startsWith("/api/erp/");
  const hasSession = SESSION_COOKIE_NAMES.some(
    (name) => hasCookieOrChunk(request, name),
  );

  if (isErpPage && !hasSession) {
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

  if (hasSession && isGuestRestrictedErpRequest(pathname, request.method)) {
    const authToken = await readSessionToken(request);
    if (authToken.status === "missing-secret") {
      return NextResponse.json(
        { error: "인증 설정을 확인할 수 없습니다." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (authToken.status === "invalid") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (authToken.token.isGuest === true) {
      return NextResponse.json(
        {
          error: "게스트 미리보기에서는 데이터를 변경할 수 없습니다.",
          code: GUEST_READ_ONLY_ERROR_CODE,
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  if (!isErpPage) {
    const response = NextResponse.next();
    if (isErpApi) {
      response.headers.append("Vary", "Cookie");
    }
    return response;
  }

  const requestHeaders = buildTrustedErpRequestHeaders(request.headers, {
    pathname: request.nextUrl.pathname,
    hostname: request.nextUrl.hostname,
    nodeEnv: process.env.NODE_ENV,
  });

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // `/erp/:path*` 만으로는 path-to-regexp 동작 차이로 `/erp` 자체가 누락될 수 있어
  // 명시적으로 두 패턴 등록. 가드 우회 (인증 없이 대시보드 접근) 사고 방지.
  matcher: ["/erp", "/erp/:path*", "/api/erp", "/api/erp/:path*"],
};
