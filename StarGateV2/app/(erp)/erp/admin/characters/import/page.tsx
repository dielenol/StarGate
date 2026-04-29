import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import PageHead from "@/components/ui/PageHead/PageHead";

import ImportClient from "./ImportClient";

export default async function CharactersImportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.role, "GM")) {
    redirect("/erp");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN" },
          { label: "CHARACTERS" },
          { label: "REGISTER" },
        ]}
        title="캐릭터 등록"
      />
      <ImportClient />
    </>
  );
}
