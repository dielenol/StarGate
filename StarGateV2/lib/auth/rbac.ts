/**
 * RBAC (Role-Based Access Control)
 *
 * 8단계 역할 계층: GM > V > A > M > H > G > J > U (높을수록 권한 큼)
 */

import { ROLE_LEVEL_RANK } from "@stargate/shared-db/types";

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

/* ── Character 편집 권한 결정 ── */

/**
 * 캐릭터 편집 모드.
 * - `admin` : V+ (관리자) — 모든 필드 편집 가능
 * - `player`: 본인 소유 캐릭터 — PLAYER_ALLOWED_CHARACTER_FIELDS (서사 7필드)만 편집
 * - `none`  : 편집 불가 (미인증, 비소유자, 비-V)
 */
export type CharacterEditMode = "admin" | "player" | "none";

export interface CharacterEditDecision {
  mode: CharacterEditMode;
  allowed: boolean;
  /** 거부 사유 (mode === 'none' 일 때만 의미). UI/응답 디버깅 용. */
  reason?: "unauthenticated" | "not-owner";
}

/**
 * 세션 사용자가 주어진 캐릭터를 편집할 수 있는지 + 어떤 모드인지 결정한다.
 *
 * 우선순위:
 *  1. 미인증 → none/unauthenticated
 *  2. V+ (관리자) → admin (소유 여부 무관)
 *  3. ownerId === sessionUserId → player
 *  4. 그 외 → none/not-owner
 *
 * 서버(라우트)와 클라이언트(상세 페이지) 양쪽에서 호출된다 — 단일 결정 함수로
 * UI 노출 ↔ 서버 권한 체크의 정합성을 보장.
 */
export function canEditCharacter(
  sessionUserId: string | undefined,
  sessionUserRole: UserRole | undefined,
  character: { ownerId: string | null },
): CharacterEditDecision {
  if (!sessionUserId || !sessionUserRole) {
    return { mode: "none", allowed: false, reason: "unauthenticated" };
  }

  if (hasRole(sessionUserRole, "V")) {
    return { mode: "admin", allowed: true };
  }

  if (character.ownerId && character.ownerId === sessionUserId) {
    return { mode: "player", allowed: true };
  }

  return { mode: "none", allowed: false, reason: "not-owner" };
}
