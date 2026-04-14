import { redirect, notFound } from "next/navigation";
import Link from "next/link";

import type { CharacterInventory, MasterItem } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  listCharacterInventory,
  listAvailableItems,
} from "@/lib/db/inventory";

import InventoryGrantForm from "./InventoryGrantForm";
import styles from "./page.module.css";

interface CharacterInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

export default async function CharacterInventoryPage({
  params,
}: CharacterInventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGm = hasRole(role, "GM");

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
    <section className={styles.charInventory}>
      <Link href="/erp/inventory" className={styles.charInventory__backLink}>
        &larr; 아이템 마스터로 돌아가기
      </Link>

      <div className={styles.charInventory__classification}>
        CHARACTER INVENTORY
      </div>
      <h1 className={styles.charInventory__title}>{character.codename}</h1>
      <p className={styles.charInventory__subtitle}>보유 장비 및 아이템</p>

      {/* GM/ADMIN: 아이템 지급 폼 */}
      {isGm && (
        <div className={styles.charInventory__grantSection}>
          <InventoryGrantForm
            characterId={characterId}
            availableItems={availableItems}
          />
        </div>
      )}

      {/* 인벤토리 테이블 */}
      {inventory.length === 0 ? (
        <p className={styles.charInventory__empty}>
          보유 아이템이 없습니다.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.charInventory__table}>
            <thead>
              <tr>
                <th>아이템</th>
                <th>수량</th>
                <th>획득일</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((entry) => (
                <tr key={String(entry._id)}>
                  <td>{entry.itemName}</td>
                  <td>{entry.quantity}</td>
                  <td>
                    {new Date(entry.acquiredAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                  <td>
                    {entry.note ? (
                      entry.note
                    ) : (
                      <span className={styles.charInventory__muted}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
