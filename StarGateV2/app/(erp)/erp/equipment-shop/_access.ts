import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

export async function requireEquipmentShopSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return {
    session,
    isGM: hasRole(session.user.role, "GM"),
  };
}
