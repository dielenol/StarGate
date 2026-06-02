import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listAgentCharacters } from "@/lib/db/characters";
import {
  listAvailableItems,
  listSharedInventory,
} from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryGrantForm from "../../inventory/[characterId]/InventoryGrantForm";
import inventoryStyles from "../../inventory/[characterId]/page.module.css";

export default async function AdminInventoryHubPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  if (!hasRole(session.user.role, "V")) {
    redirect("/erp/inventory");
  }

  const [characters, availableItems, sharedInventory] = await Promise.all([
    listAgentCharacters(null).catch(() => []),
    listAvailableItems().catch(() => []),
    listSharedInventory().catch(() => []),
  ]);

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

      <Box className={inventoryStyles.grantBox}>
        <PanelTitle
          right={
            <span className={inventoryStyles.mono}>
              공용 {sharedInventory.length}개
            </span>
          }
        >
          GRANT SHARED ITEM · GM
        </PanelTitle>
        <InventoryGrantForm mode="shared" availableItems={availableItems} />
      </Box>

      <Box>
        <PanelTitle>캐릭터별 인벤토리 운용</PanelTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {characters.length === 0 ? (
            <div
              style={{
                padding: "24px 12px",
                color: "var(--ink-3)",
                fontSize: 14,
              }}
            >
              등록된 캐릭터가 없습니다.
            </div>
          ) : (
            characters.map((character) => (
              <Link
                key={String(character._id)}
                href={`/erp/admin/inventory/${String(character._id)}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "10px 12px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--bg-2)",
                }}
              >
                <span
                  style={{
                    color: "var(--gold)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 14,
                    letterSpacing: "0.08em",
                  }}
                >
                  {character.codename}
                </span>
                <span style={{ color: "var(--ink-2)", fontSize: 14 }}>
                  {character.lore?.name ?? character.codename}
                </span>
              </Link>
            ))
          )}
        </div>
      </Box>
    </>
  );
}
