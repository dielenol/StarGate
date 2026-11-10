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
import { getMaintenanceState, isErpPath, isErpApiPath, isMaintenanceResource, maintenanceRetryAfter } from "@/lib/maintenance/schedule";

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
  const isErpPage = isErpPath(pathname);
  const isErpApi = isErpApiPath(pathname);
  const maintenance = getMaintenanceState();
  const readOnly = request.method === "GET" || request.method === "HEAD";
  const maintenanceResource = readOnly && isMaintenanceResource(pathname, process.env.NODE_ENV);
  if (!maintenanceResource && maintenance.phase === "active") {
    const headers = {
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": maintenanceRetryAfter(),
    };
    // 인증/역할/로컬 우회보다 먼저 검사한다. Server Action도 실행 전에 중단한다.
    if (readOnly && pathname !== "/api" && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/maintenance", request.url), { status: 307, headers });
    }
    return NextResponse.json({
      code: "SITE_MAINTENANCE",
      error: "보안 침해 대응으로 사이트 전체 이용이 중단되었습니다. 재개 일정은 추후 공지합니다.",
      nextUpdateAt: maintenance.endsAt,
      resumePolicy: maintenance.resumePolicy,
    }, { status: 503, headers });
  }
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
  // 봉쇄 일정(ERP_MAINTENANCE_WINDOW)이 없으면 ERP 경로만 검사한다.
  // 봉쇄를 다시 켤 때는 ["/:path*"]로 바꿔 공개 페이지·인증·API·Server Action을 모두 검사한다.
  // lib/maintenance/__tests__/proxy.test.mjs의 일관성 테스트가 이 짝을 강제한다.
  // `/erp/:path*` 만으로는 path-to-regexp 동작 차이로 `/erp` 자체가 누락될 수 있어 두 패턴을 명시한다.
  matcher: ["/erp", "/erp/:path*", "/api/erp", "/api/erp/:path*"],
};
