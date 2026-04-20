import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";

import CharacterCreateForm from "./CharacterCreateForm";

export default async function CharacterNewPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGMOrAbove = hasRole(session.user.role, "GM");

  if (!isGMOrAbove) {
    redirect("/erp/characters");
  }

  return (
    <>
      <PageHead
        breadcrumb="CHARACTERS / NEW"
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
