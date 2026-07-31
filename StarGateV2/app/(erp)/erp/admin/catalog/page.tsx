import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";

import PageHead from "@/components/ui/PageHead/PageHead";

import CatalogCreateForm from "./CatalogCreateForm";

export const metadata = {
  title: "신규 품목 운영 — Stargate ERP",
};

export default async function CatalogAdminPage() {
  const session = await getActiveSession();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin" },
          { label: "CATALOG" },
        ]}
        title="신규 품목 운영"
      />
      <CatalogCreateForm />
    </>
  );
}
