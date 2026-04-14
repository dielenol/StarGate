/**
 * RBAC (Role-Based Access Control)
 *
 * 5단계 역할 계층: SUPER_ADMIN > ADMIN > GM > PLAYER > GUEST
 */

import type { UserRole } from "@/types/user";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  GM: 60,
  PLAYER: 40,
  GUEST: 20,
};

/** 경로별 최소 요구 역할 (prefix 매칭, 구체적 경로 우선) */
const ROUTE_PERMISSIONS: Array<{ pattern: string; minRole: UserRole }> = [
  { pattern: "/erp/admin", minRole: "ADMIN" },
  { pattern: "/erp", minRole: "PLAYER" },
];

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function getRouteMinRole(pathname: string): UserRole | null {
  for (const { pattern, minRole } of ROUTE_PERMISSIONS) {
    if (pathname.startsWith(pattern)) {
      return minRole;
    }
  }
  return null;
}

export function requireRole(userRole: UserRole, requiredRole: UserRole): void {
  if (!hasRole(userRole, requiredRole)) {
    throw new Error(`권한 부족: ${requiredRole} 이상 필요 (현재: ${userRole})`);
  }
}
