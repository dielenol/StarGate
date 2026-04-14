import { auth } from "@/lib/auth/config";
import { getRouteMinRole, hasRole } from "@/lib/auth/rbac";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ERP 경로가 아니면 통과
  const minRole = getRouteMinRole(pathname);
  if (!minRole) return NextResponse.next();

  // 비인증 → 로그인
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 역할 부족 → 403
  const userRole = req.auth.user.role;
  if (!hasRole(userRole, minRole)) {
    return new NextResponse("권한이 부족합니다.", { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/erp/:path*"],
};
