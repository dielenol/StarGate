import { redirect } from "next/navigation";

import { isNavPathLocked } from "@/components/erp/nav-config";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasPlayerServiceTestPathAccess } from "@/lib/auth/player-service-test-access";
import { hasRole } from "@/lib/auth/rbac";
import { getErpPageLockOverrides } from "@/lib/db/erp-page-locks";
import { isArmoryBureauSuspended } from "@/lib/equipment-shop/suspension";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";

/**
 * 병기부 페이지 공통 세션 가드.
 * GM/로컬 프리뷰가 아니어도 해당 경로의 운영 잠금(erp_page_locks)이
 * 해제되어 있으면 일반 사용자에게 페이지를 연다 — PageLockControl 토글과 동기화.
 *
 * 병기부 운영 중지(ARMORY_BUREAU_ENABLED 미설정) 중에는 JTEST·로컬 프리뷰·잠금 해제를
 * 모두 무시하고 GM 에게만 열람용으로 연다.
 */
export async function requireEquipmentShopSession(
  lockPath = "/erp/equipment-shop",
) {
  const session = await getActiveSession();
  if (!session?.user) {
    redirect("/login");
  }

  const isGM = hasRole(session.user.role, "GM");
  const suspended = isArmoryBureauSuspended();
  if (suspended) {
    return {
      session,
      isGM,
      canPreview: isGM,
      suspended,
    };
  }

  let canPreview =
    isGM ||
    hasPlayerServiceTestPathAccess(session.user, lockPath) ||
    (await hasLocalErpPreviewAccess());
  if (!canPreview) {
    canPreview = !isNavPathLocked(lockPath, await getErpPageLockOverrides());
  }

  return {
    session,
    isGM,
    canPreview,
    suspended,
  };
}
