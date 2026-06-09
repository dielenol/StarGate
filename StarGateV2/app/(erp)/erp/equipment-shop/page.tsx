/**
 * 장비 판매점 · Stargate ERP
 *
 * 편의점 화면 흐름을 장비 카탈로그(WEAPON/ARMOR) 대상으로 얇게 복제한다.
 * 배경/NPC 이미지 자산은 임시로 편의점 자산을 재사용한다.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";
import {
  EQUIPMENT_SHOP_CATEGORIES,
  toEquipmentShopCatalogItem,
} from "@/lib/equipment-shop/catalog";

import type { CreditsResponse } from "@/hooks/queries/useCreditsQuery";
import type { EquipmentShopCatalogResponse } from "@/hooks/queries/useEquipmentShopQuery";

import EquipmentShopClient from "./EquipmentShopClient";

const INITIAL_LEDGER_LIMIT = 50;

export const metadata = {
  title: "장비 판매점 · Stargate ERP",
};

async function buildCatalogResponse(): Promise<EquipmentShopCatalogResponse> {
  const masterItems = await listMasterItemsByCategoryFilter(
    EQUIPMENT_SHOP_CATEGORIES,
  );
  const items = masterItems
    .map(toEquipmentShopCatalogItem)
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    items,
    isOpen: true,
    mode: "open",
    scheduledOpen: true,
    forceOpen: true,
    forceClosed: false,
  };
}

export default async function EquipmentShopPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[equipment-shop] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  const [initialCatalog, initialBalance, initialLedger] = await Promise.all([
    buildCatalogResponse().catch(
      (): EquipmentShopCatalogResponse => ({
        items: [],
        isOpen: true,
        mode: "open",
        scheduledOpen: true,
        forceOpen: true,
        forceClosed: false,
      }),
    ),
    mainCharacterId
      ? getCharacterBalance(mainCharacterId).catch(() => 0)
      : Promise.resolve(0),
    mainCharacterId
      ? listCreditTransactions(mainCharacterId, INITIAL_LEDGER_LIMIT).catch(
          () => [],
        )
      : Promise.resolve([]),
  ]);

  const initialCredits: CreditsResponse | undefined =
    mainCharacter && mainCharacterId
      ? {
          transactions: initialLedger.map((t) => ({
            ...t,
            _id: t._id?.toString() as unknown as typeof t._id,
          })),
          balance: initialBalance,
          characterId: mainCharacterId,
          characterCodename: mainCharacter.codename,
        }
      : undefined;

  return (
    <EquipmentShopClient
      initialCatalog={initialCatalog}
      mainCharacter={
        mainCharacter
          ? { id: String(mainCharacter._id), codename: mainCharacter.codename }
          : null
      }
      initialBalance={initialBalance}
      initialCredits={initialCredits}
      mainCharacterError={mainCharacterError}
    />
  );
}
