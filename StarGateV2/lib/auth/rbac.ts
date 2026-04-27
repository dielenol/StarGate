/**
 * RBAC (Role-Based Access Control)
 *
 * 8단계 역할 계층: GM > V > A > M > H > G > J > U (높을수록 권한 큼)
 */

import { ROLE_LEVEL_RANK } from "@stargate/shared-db/types";

import type { Character } from "@/types/character";
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
 * - `player`: 본인 소유 AGENT — lore 8필드만 편집 (play 는 항상 admin 전용)
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
 * @deprecated `canEditLore` / `canEditPlay` 로 분리. 점진 마이그레이션 후 제거 예정.
 *
 * 세션 사용자가 주어진 캐릭터를 편집할 수 있는지 + 어떤 모드인지 결정한다.
 * 새 코드는 sub-document 별 권한 체크를 사용해 화이트리스트 분기를 명확히 할 것.
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

/**
 * play sub-document 편집 가능 여부.
 *
 * 정책: admin (V+) 만 편집 가능. AGENT 본인이라도 능력치/장비/어빌리티는 직접 수정 불가
 * (운영 일관성 / 시트 정확도 — GM 결재 경유).
 *
 * NPC 는 play 가 없으므로 항상 false. 화이트리스트 가드도 같은 결정을 따른다.
 */
export function canEditPlay(
  sessionUserId: string | undefined,
  sessionUserRole: UserRole | undefined,
  character: Pick<Character, "type" | "ownerId">,
): boolean {
  if (!sessionUserId || !sessionUserRole) return false;
  if (character.type !== "AGENT") return false;
  return hasRole(sessionUserRole, "V");
}

/**
 * lore sub-document 편집 가능 여부 + 모드.
 *
 * 정책:
 *  - admin (V+) : lore 전체 편집 가능
 *  - player (본인 AGENT 소유자) : lore 8필드 (서사/신상) 만 편집
 *  - 그 외 : none
 *
 * 8필드는 shared-db `ALLOWED_LORE_FIELDS_PLAYER` 와 1:1 매칭:
 *   appearance / personality / background / quote / gender / age / height / weight
 */
export function canEditLore(
  sessionUserId: string | undefined,
  sessionUserRole: UserRole | undefined,
  character: Pick<Character, "type" | "ownerId">,
): CharacterEditDecision {
  if (!sessionUserId || !sessionUserRole) {
    return { mode: "none", allowed: false, reason: "unauthenticated" };
  }

  if (hasRole(sessionUserRole, "V")) {
    return { mode: "admin", allowed: true };
  }

  if (
    character.type === "AGENT" &&
    character.ownerId &&
    character.ownerId === sessionUserId
  ) {
    return { mode: "player", allowed: true };
  }

  return { mode: "none", allowed: false, reason: "not-owner" };
}
