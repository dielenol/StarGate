import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { requireRole } from "@/lib/auth/rbac";

import WikiCreateForm from "./WikiCreateForm";

export default async function WikiNewPage() {
  const session = await getActiveSession();
  if (!session?.user) {
    redirect("/login");
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    redirect("/erp/wiki");
  }

  return <WikiCreateForm />;
}
