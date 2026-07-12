import { redirect } from "next/navigation";

import { isNavPathLocked } from "@/components/erp/nav-config";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { getErpPageLockOverrides } from "@/lib/db/erp-page-locks";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";

/**
 * 병기부 페이지 공통 세션 가드.
 * GM/로컬 프리뷰가 아니어도 해당 경로의 운영 잠금(erp_page_locks)이
 * 해제되어 있으면 일반 사용자에게 페이지를 연다 — PageLockControl 토글과 동기화.
 */
export async function requireEquipmentShopSession(
  lockPath = "/erp/equipment-shop",
) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isGM = hasRole(session.user.role, "GM");
  let canPreview = isGM || (await hasLocalErpPreviewAccess());
  if (!canPreview) {
    canPreview = !isNavPathLocked(lockPath, await getErpPageLockOverrides());
  }

  return {
    session,
    isGM,
    canPreview,
  };
}
