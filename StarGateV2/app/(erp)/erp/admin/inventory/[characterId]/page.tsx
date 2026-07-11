import { redirect, notFound } from "next/navigation";

import type {
  CharacterInventoryResponse,
  MasterItem,
} from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  listAvailableItems,
  listCharacterInventoryEntries,
  serializeCharacterInventory,
} from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryClient from "../../../inventory/[characterId]/InventoryClient";
import InventoryGrantForm, {
  type InventoryGrantItem,
} from "../../../inventory/[characterId]/InventoryGrantForm";
import styles from "../../../inventory/[characterId]/page.module.css";

interface AdminInventoryPageProps {
  params: Promise<{ characterId: string }>;
}

function toInventoryGrantItems(items: MasterItem[]): InventoryGrantItem[] {
  return items
    .filter((item) => item._id)
    .map((item) => ({
      id: String(item._id),
      name: item.name,
      category: item.category,
    }));
}

/**
 * GM 전용 인벤토리 관리 (지급 + 조회). 일반 `/erp/inventory/[characterId]` 의 GM 분기가
 * 본 라우트로 분리됨 — 일반 인벤은 사용자/캐릭 view 전용, admin 라우트만 GrantForm 노출.
 *
 * 권한: V 이상 (GM/Voidwalker). 미만 시 일반 인벤으로 redirect.
 */
export default async function AdminCharacterInventoryPage({
  params,
}: AdminInventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  if (!hasRole(role, "V")) {
    // 일반 사용자가 admin URL 직접 진입 시 캐릭별 일반 인벤으로 강등.
    const { characterId } = await params;
    redirect(`/erp/inventory/${characterId}`);
  }

  const { characterId } = await params;

  const character = await findCharacterById(characterId);
  if (!character) {
    notFound();
  }

  let inventoryResponse: CharacterInventoryResponse = {
    inventory: [],
    entries: [],
    equipped: {},
  };
  let availableItems: MasterItem[] = [];

  try {
    const result = await listCharacterInventoryEntries(characterId);
    inventoryResponse = {
      inventory: serializeCharacterInventory(result.inventory),
      entries: result.entries,
      equipped: Object.fromEntries(
        result.entries
          .filter((entry) => entry.equippedSlot)
          .map((entry) => [entry.equippedSlot, entry]),
      ),
    };
  } catch {
    /* DB 실패 시 빈 응답 */
  }

  try {
    availableItems = await listAvailableItems();
  } catch {
    /* 아이템 목록 실패 → 빈 배열 */
  }

  const grantItems = toInventoryGrantItems(availableItems);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin/inventory" },
          { label: "INVENTORY", href: "/erp/admin/inventory" },
          { label: character.codename },
        ]}
        title={`${character.codename} · 관리자 모드`}
        right={
          <>
            <Button as="a" href={`/erp/inventory/${characterId}`}>
              ← 일반 모드
            </Button>
            <Button as="a" href="/erp/admin/inventory">
              ← 허브
            </Button>
          </>
        }
      />

      <Box className={styles.grantBox}>
        <PanelTitle>GRANT ITEM · GM</PanelTitle>
        <InventoryGrantForm
          characterId={characterId}
          availableItems={grantItems}
        />
      </Box>

      <InventoryClient
        entries={inventoryResponse.entries}
        characterId={characterId}
        initialResponse={inventoryResponse}
      />
    </>
  );
}
