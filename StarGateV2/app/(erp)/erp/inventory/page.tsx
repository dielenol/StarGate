import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { listCharactersByOwner } from "@/lib/db/characters";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

/**
 * 인벤토리 진입점. 사이드바 "인벤토리" 메뉴에서 들어옴.
 *
 * 동작:
 *  - 본인 보유 캐릭터 조회 → tier=MAIN 우선, 없으면 첫 번째 캐릭터의 inventory 로 redirect.
 *  - 보유 캐릭터가 없으면 안내 페이지 노출 (캐릭터 신청 안내).
 *
 * 편의점 마스터 아이템 카탈로그(이전 페이지 내용) 는 인벤토리 의미가 아니므로
 * 본 라우트에서 분리됨. GM 카탈로그 조회는 `/erp/inventory/items/new` 의 폼이나
 * `/erp/shop` 에서 별도 노출.
 */
export default async function InventoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const myCharacters = await listCharactersByOwner(session.user.id).catch(
    () => [],
  );

  if (myCharacters.length === 0) {
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

  // 본인 첫 번째 캐릭터의 인벤토리로 — listCharactersByOwner 가 tier 를 반환하지 않아
  // 추가 fetch 없이 순서대로 첫 캐릭터 선택. 필요 시 [characterId] 페이지에서 캐릭터 전환 UI.
  const first = myCharacters[0];
  redirect(`/erp/inventory/${String(first._id)}`);
}
