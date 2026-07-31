import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import CharacterCreateForm from "./CharacterCreateForm";

export default async function CharacterNewPage() {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const isGMOrAbove = hasRole(session.user.role, "V");

  if (!isGMOrAbove) {
    redirect("/erp/characters");
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "CHARACTERS", href: "/erp/characters" },
          { label: "NEW" },
        ]}
        title="캐릭터 추가"
        right={
          <Button as="a" href="/erp/characters">
            ← 목록
          </Button>
        }
      />
      <CharacterCreateForm />
    </>
  );
}
