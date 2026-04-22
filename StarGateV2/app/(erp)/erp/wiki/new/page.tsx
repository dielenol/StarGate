import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import WikiCreateForm from "./WikiCreateForm";

export default async function WikiNewPage() {
  const session = await auth();
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
