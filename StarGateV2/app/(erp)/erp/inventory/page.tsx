import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listCharactersByOwner } from "@/lib/db/characters";
import { listSharedInventory } from "@/lib/db/inventory";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";

import InventoryModeNav from "./_components/InventoryModeNav";
import styles from "./page.module.css";

export default async function InventoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const isGm = hasRole(session.user.role, "V");
  const [myCharacters, sharedInventory] = await Promise.all([
    listCharactersByOwner(session.user.id).catch(() => []),
    listSharedInventory().catch(() => []),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "INVENTORY" },
        ]}
        title="인벤토리"
        right={
          <>
            {isGm ? (
              <Button as="a" href="/erp/inventory/items/new" variant="primary">
                마스터 아이템
              </Button>
            ) : null}
            <Button as="a" href="/erp/shop">
              편의점
            </Button>
          </>
        }
      />

      <InventoryModeNav active="personal" />

      <div className={styles.grid}>
        <Box className={styles.panel}>
          <PanelTitle right={<span className={styles.mono}>{myCharacters.length}명</span>}>
            PERSONAL INVENTORY
          </PanelTitle>
          <p className={styles.copy}>
            캐릭터별 장비, 소모품, 샘플을 확인합니다. 편의점 구매품과 개인 지급품은
            이쪽에 누적됩니다.
          </p>

          {myCharacters.length === 0 ? (
            <div className={styles.empty}>
              보유 캐릭터가 없습니다. 캐릭터 등록 후 개인 인벤토리를 사용할 수
              있습니다.
            </div>
          ) : (
            <div className={styles.characterList}>
              {myCharacters.map((character) => (
                <Button
                  key={String(character._id)}
                  as="a"
                  href={`/erp/inventory/${String(character._id)}`}
                >
                  {character.codename}
                </Button>
              ))}
            </div>
          )}
        </Box>

        <Box className={styles.panel}>
          <PanelTitle right={<span className={styles.mono}>{sharedInventory.length}개</span>}>
            SHARED INVENTORY
          </PanelTitle>
          <p className={styles.copy}>
            세션 보상처럼 특정 캐릭터 한 명에게 귀속되지 않는 물자를 모아두는
            공용 보관함입니다.
          </p>
          <div className={styles.actions}>
            <Button as="a" href="/erp/inventory/shared" variant="primary">
              공용 보관함 열기
            </Button>
          </div>
        </Box>
      </div>
    </>
  );
}
