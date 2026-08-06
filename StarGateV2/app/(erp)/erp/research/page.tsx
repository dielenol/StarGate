import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";

import PageHead from "@/components/ui/PageHead/PageHead";

import ResearchClient from "./ResearchClient";

export default async function ResearchPage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");

  return (
    <>
      <PageHead
        breadcrumb={[{ label: "ERP", href: "/erp" }, { label: "연구소" }]}
        title="연구소"
      />
      <ResearchClient isGm={hasRole(session.user.role, "GM")} />
    </>
  );
}
