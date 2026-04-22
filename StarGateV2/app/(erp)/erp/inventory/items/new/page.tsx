import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import ItemCreateForm from "./ItemCreateForm";

export default async function NewItemPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    redirect("/erp/inventory");
  }

  return (
    <>
      <PageHead
        breadcrumb="EQUIPMENT / NEW"
        title="아이템 추가"
        right={
          <Button as="a" href="/erp/inventory">
            ← 도감
          </Button>
        }
      />
      <ItemCreateForm />
    </>
  );
}
