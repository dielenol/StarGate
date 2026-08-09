import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";

import PageHead from "@/components/ui/PageHead/PageHead";
import { getAdminIntegrationStatusResponse } from "@/lib/erp/admin-integration-status";

import AdminIntegrationStatusClient from "./AdminIntegrationStatusClient";

export default async function AdminPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp");
  }
  const initialData = await getAdminIntegrationStatusResponse();

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN" },
        ]}
        title="관리자 운영 현황"
      />
      <AdminIntegrationStatusClient initialData={initialData} />
    </>
  );
}
