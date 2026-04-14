import { redirect } from "next/navigation";
import Link from "next/link";

import type { ItemCategory, MasterItem } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listMasterItems } from "@/lib/db/inventory";

import styles from "./page.module.css";

const CATEGORIES: { value: ItemCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "WEAPON", label: "무기" },
  { value: "ARMOR", label: "방어구" },
  { value: "CONSUMABLE", label: "소모품" },
  { value: "MATERIAL", label: "재료" },
  { value: "SPECIAL", label: "특수" },
];

const CATEGORY_BADGE_CLASS: Record<ItemCategory, string> = {
  WEAPON: styles["inventory__badge--weapon"],
  ARMOR: styles["inventory__badge--armor"],
  CONSUMABLE: styles["inventory__badge--consumable"],
  MATERIAL: styles["inventory__badge--material"],
  SPECIAL: styles["inventory__badge--special"],
};

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  CONSUMABLE: "소모품",
  MATERIAL: "재료",
  SPECIAL: "특수",
};

interface InventoryPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGm = hasRole(role, "GM");

  const resolvedParams = await searchParams;
  const categoryFilter = resolvedParams.category as ItemCategory | undefined;

  let allItems: MasterItem[] = [];

  try {
    allItems = await listMasterItems();
  } catch {
    // DB 연결 실패 시 빈 배열 유지
  }

  const items: MasterItem[] = categoryFilter
    ? allItems.filter((item) => item.category === categoryFilter)
    : allItems;

  return (
    <section className={styles.inventory}>
      <div className={styles.inventory__classification}>
        EQUIPMENT REGISTRY
      </div>
      <h1 className={styles.inventory__title}>아이템 마스터</h1>

      {/* 카테고리 필터 */}
      <nav className={styles.inventory__filters} aria-label="아이템 카테고리 필터">
        {CATEGORIES.map((cat) => {
          const isActive =
            cat.value === "ALL"
              ? !categoryFilter
              : categoryFilter === cat.value;
          const href =
            cat.value === "ALL"
              ? "/erp/inventory"
              : `/erp/inventory?category=${cat.value}`;

          return (
            <Link
              key={cat.value}
              href={href}
              className={`${styles.inventory__filterLink} ${isActive ? styles["inventory__filterLink--active"] : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {cat.label}
            </Link>
          );
        })}
      </nav>

      {/* GM/ADMIN: 아이템 추가 버튼 */}
      {isGm && (
        <div className={styles.inventory__actions}>
          <Link href="/erp/inventory/items/new" className={styles.inventory__addButton}>
            + 아이템 추가
          </Link>
        </div>
      )}

      {/* 아이템 테이블 */}
      {items.length === 0 ? (
        <p className={styles.inventory__empty}>
          등록된 아이템이 없습니다.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className={styles.inventory__table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>카테고리</th>
                <th>가격</th>
                <th>데미지</th>
                <th>효과</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={String(item._id)}>
                  <td>{item.name}</td>
                  <td>
                    <span
                      className={`${styles.inventory__badge} ${CATEGORY_BADGE_CLASS[item.category]}`}
                    >
                      {CATEGORY_LABEL[item.category]}
                    </span>
                  </td>
                  <td>{String(item.price)}</td>
                  <td>
                    {item.damage ? (
                      item.damage
                    ) : (
                      <span className={styles.inventory__muted}>-</span>
                    )}
                  </td>
                  <td>
                    {item.effect ? (
                      item.effect
                    ) : (
                      <span className={styles.inventory__muted}>-</span>
                    )}
                  </td>
                  <td>
                    {item.isAvailable ? (
                      <span className={styles.inventory__available}>Available</span>
                    ) : (
                      <span className={styles.inventory__unavailable}>Unavailable</span>
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
