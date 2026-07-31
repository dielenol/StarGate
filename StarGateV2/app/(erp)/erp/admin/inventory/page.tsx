import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { getAdminInventoryOverviewResponse } from "@/lib/erp/admin-inventory-overview";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import AdminInventoryOverviewClient from "./AdminInventoryOverviewClient";

export default async function AdminInventoryHubPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }
  if (!hasRole(session.user.role, "V")) {
    redirect("/erp/inventory");
  }

  const initialData = await getAdminInventoryOverviewResponse();

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN" },
          { label: "INVENTORY" },
        ]}
        title="인벤토리 운용"
        right={
          <Button as="a" href="/erp/inventory/items/new" variant="primary">
            + 신규 아이템
          </Button>
        }
      />

      <AdminInventoryOverviewClient initialData={initialData} />
    </>
  );
}
