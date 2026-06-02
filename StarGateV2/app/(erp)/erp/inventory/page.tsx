import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { listCharactersByOwner } from "@/lib/db/characters";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

export default async function InventoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const myCharacters = await listCharactersByOwner(session.user.id).catch(
    () => [],
  );

  if (myCharacters.length > 0) {
    const first = myCharacters[0];
    redirect(`/erp/inventory/${String(first._id)}`);
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "INVENTORY" },
        ]}
        title="인벤토리"
      />

      <Box>
        <div
          style={{
            padding: "32px 24px",
            textAlign: "center",
            color: "var(--ink-2)",
            fontSize: "14px",
            letterSpacing: "0.04em",
          }}
        >
          보유 캐릭터가 없습니다. 캐릭터 등록 후 다시 접근해주세요.
        </div>
      </Box>
    </>
  );
}
