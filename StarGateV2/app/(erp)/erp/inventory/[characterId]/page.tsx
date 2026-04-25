import { redirect, notFound } from "next/navigation";

import type { CharacterInventory, MasterItem } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  listCharacterInventory,
  listAvailableItems,
} from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryGrantForm from "./InventoryGrantForm";
import styles from "./page.module.css";

interface CharacterInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function CharacterInventoryPage({
  params,
}: CharacterInventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGm = hasRole(role, "V");

  const { characterId } = await params;

  const character = await findCharacterById(characterId);
  if (!character) {
    notFound();
  }

  let inventory: CharacterInventory[] = [];
  let availableItems: MasterItem[] = [];

  try {
    inventory = await listCharacterInventory(characterId);
  } catch {
    // DB 연결 실패 시 빈 배열 유지
  }

  if (isGm) {
    try {
      availableItems = await listAvailableItems();
    } catch {
      // 아이템 목록 조회 실패 시 빈 배열 유지
    }
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "EQUIPMENT", href: "/erp/inventory" },
          { label: character.codename },
        ]}
        title={character.codename}
        right={
          <Button as="a" href="/erp/inventory">
            ← 도감
          </Button>
        }
      />

      {isGm ? (
        <Box className={styles.grantBox}>
          <PanelTitle>GRANT ITEM · GM</PanelTitle>
          <InventoryGrantForm
            characterId={characterId}
            availableItems={availableItems}
          />
        </Box>
      ) : null}

      <Box>
        <PanelTitle
          right={<span className={styles.mono}>{inventory.length} 개</span>}
        >
          INVENTORY
        </PanelTitle>

        {inventory.length === 0 ? (
          <div className={styles.empty}>보유 아이템이 없습니다.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>아이템</th>
                  <th className={styles.numCol}>수량</th>
                  <th className={styles.dateCol}>획득일</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((entry) => (
                  <tr key={String(entry._id)}>
                    <td>{entry.itemName}</td>
                    <td className={`${styles.numCol} ${styles.mono}`}>
                      {entry.quantity}
                    </td>
                    <td className={`${styles.dateCol} ${styles.mono}`}>
                      {formatDate(entry.acquiredAt)}
                    </td>
                    <td>
                      {entry.note ? (
                        entry.note
                      ) : (
                        <span className={styles.muted}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
