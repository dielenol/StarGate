/**
 * RBAC (Role-Based Access Control)
 *
 * 8단계 역할 계층: GM > V > A > M > H > G > J > U (높을수록 권한 큼)
 */

import { ROLE_LEVEL_RANK } from "@stargate/shared-db";

import type { UserRole } from "@/types/user";

const ROLE_HIERARCHY = ROLE_LEVEL_RANK;

/** 경로별 최소 요구 역할 (prefix 매칭, 구체적 경로 우선) */
const ROUTE_PERMISSIONS: ReadonlyArray<{ pattern: string; minRole: UserRole }> = [
  { pattern: "/erp/admin", minRole: "GM" },
  { pattern: "/erp", minRole: "G" },
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
