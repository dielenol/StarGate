/**
 * 편의점 — Stargate ERP
 *
 * 서버 컴포넌트: 메인 캐릭터 + 카탈로그/재고 + 잔액을 병렬 fetch 후
 * `ShopClient` 에 initialData 로 주입. 클라이언트는 TanStack Query 캐시 시드 +
 * 백그라운드 갱신 + 구매 mutation 처리.
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 * TODO(M2-B): 편의점 권한 모델 결정 (현재 ERP 로그인 모두 허용) + GM 재고/입고/환불 기능.
 */

import { redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { hasPlayerServiceTestAccess } from "@/lib/auth/player-service-test-access";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterDisplayLiteByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { countPendingShopReorderRequests } from "@/lib/shop/reorder-requests";

import type { ShopCatalogResponse } from "@/hooks/queries/useShopQuery";

import { buildShopCatalogResponse } from "./_data";
import ShopClient from "./ShopClient";

export const metadata = {
  title: "편의점 — Stargate ERP",
};

/* ── 페이지 ── */

export default async function ShopPage() {
  const session = await getActiveSession();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = getOwnedDataViewerId(session.user);
  const isGM = hasRole(session.user.role, "GM");
  const playerServiceTestAccess = hasPlayerServiceTestAccess(session.user);

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = userId
      ? await findMainCharacterByOwner(userId)
      : null;
  } catch (err) {
    // 원본 메시지(메인 캐릭 codename 들 포함)는 운영 채널(Vercel 로그)에만 남기고
    // 사용자에게는 일반화된 메시지만 노출 — 자기 정보지만 운영 메시지를 직접 보여주지 않는다.
    console.error(
      `[shop] findMainCharacterByOwner integrity violation (userId=${userId ?? "guest"}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // 카탈로그/잔액 병렬 fetch — 편의점은 원장을 표시하지 않으므로 읽지 않는다.
  const [initialCatalog, initialBalance, pendingReorderCount] =
    await Promise.all([
      buildShopCatalogResponse(playerServiceTestAccess, {
        readOnly: session.user.isGuest,
      }).catch(
        (): ShopCatalogResponse => ({
          items: [],
          isOpen: false,
          mode: "auto",
          scheduledOpen: false,
          forceOpen: false,
          forceClosed: false,
        }),
      ),
      mainCharacterId
        ? getCharacterBalance(mainCharacterId).catch(
            (): number | undefined => undefined,
          )
        : Promise.resolve(0),
      isGM
        ? countPendingShopReorderRequests().catch(() => 0)
        : Promise.resolve(0),
    ]);

  return (
    <ShopClient
      initialCatalog={initialCatalog}
      mainCharacter={
        mainCharacter
          ? { id: String(mainCharacter._id), codename: mainCharacter.codename }
          : null
      }
      initialBalance={initialBalance}
      mainCharacterError={mainCharacterError}
      isGM={isGM}
      initialPendingReorderCount={pendingReorderCount}
    />
  );
}
