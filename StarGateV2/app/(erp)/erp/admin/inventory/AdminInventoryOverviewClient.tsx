"use client";

import Link from "next/link";

import { useAdminInventoryOverview } from "@/hooks/queries/useAdminInventoryOverviewQuery";
import type { AdminInventoryOverviewResponse } from "@/types/erp-realtime";

import Box from "@/components/ui/Box/Box";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryGrantForm from "../../inventory/[characterId]/InventoryGrantForm";
import inventoryStyles from "../../inventory/[characterId]/page.module.css";

export default function AdminInventoryOverviewClient({
  initialData,
}: {
  initialData: AdminInventoryOverviewResponse;
}) {
  const { data = initialData } = useAdminInventoryOverview({
    initialData,
  });

  return (
    <>
      <Box className={inventoryStyles.grantBox}>
        <PanelTitle
          right={
            <span className={inventoryStyles.mono}>
              공용 {data.sharedInventoryCount}개
            </span>
          }
        >
          GRANT SHARED ITEM · GM
        </PanelTitle>
        <InventoryGrantForm
          mode="shared"
          availableItems={data.availableItems}
        />
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
          {data.characters.length === 0 ? (
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
            data.characters.map((character) => (
              <Link
                key={character.id}
                href={`/erp/admin/inventory/${character.id}`}
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
                  {[character.type, character.name]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            ))
          )}
        </div>
      </Box>
    </>
  );
}
