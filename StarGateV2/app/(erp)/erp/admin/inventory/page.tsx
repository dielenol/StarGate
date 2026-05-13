import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listAgentCharacters } from "@/lib/db/characters";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

/**
 * GM 전용 인벤토리 관리 허브.
 *  - 캐릭터 list → 각 캐릭의 admin/inventory/[characterId] 진입
 *  - "신규 아이템" 생성 폼 진입 link
 *
 * 권한: V 이상.
 */
export default async function AdminInventoryHubPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  if (!hasRole(session.user.role, "V")) {
    redirect("/erp/inventory");
  }

  const characters = await listAgentCharacters(null).catch(() => []);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN" },
          { label: "INVENTORY" },
        ]}
        title="인벤토리 관리"
        right={
          <Button as="a" href="/erp/inventory/items/new" variant="primary">
            + 신규 아이템
          </Button>
        }
      />

      <Box>
        <PanelTitle>캐릭터 목록</PanelTitle>
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
            characters.map((c) => (
              <Link
                key={String(c._id)}
                href={`/erp/admin/inventory/${String(c._id)}`}
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
                  {c.codename}
                </span>
                <span style={{ color: "var(--ink-2)", fontSize: 14 }}>
                  {c.lore?.name ?? c.codename}
                </span>
              </Link>
            ))
          )}
        </div>
      </Box>
    </>
  );
}
