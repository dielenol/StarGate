import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";

export async function requireEquipmentShopSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isGM = hasRole(session.user.role, "GM");
  return {
    session,
    isGM,
    canPreview: isGM || (await hasLocalErpPreviewAccess()),
  };
}
