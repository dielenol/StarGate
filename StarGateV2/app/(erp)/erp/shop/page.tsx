/**
 * 편의점 — Stargate ERP
 *
 * 서버 컴포넌트: 메인 캐릭터 + 카탈로그/재고 + 보유 인벤 + 잔액을 병렬 fetch 후
 * `ShopClient` 에 initialData 로 주입. 클라이언트는 TanStack Query 캐시 시드 +
 * 백그라운드 갱신 + 구매/소비 mutation 처리.
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 * TODO(M2-B): 편의점 권한 모델 결정 (현재 ERP 로그인 모두 허용) + GM 재고/입고/환불 기능.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import {
  findMasterItemsBySlugs,
  listCharacterInventory,
} from "@/lib/db/inventory";
import { getAllDailyStocks } from "@/lib/db/shop";
import { findShopItemBySlug, isShopOpen, SHOP_CATALOG } from "@/lib/shop/catalog";

import type { CreditsResponse } from "@/hooks/queries/useCreditsQuery";
import type {
  ShopCatalogResponse,
  ShopInventoryResponse,
} from "@/hooks/queries/useShopQuery";

import ShopClient from "./ShopClient";

const INITIAL_LEDGER_LIMIT = 50;

export const metadata = {
  title: "편의점 — Stargate ERP",
};

/* ── 서버 측 카탈로그 응답 빌더 (catalog API 와 동일 형식) ── */

async function buildCatalogResponse(): Promise<ShopCatalogResponse> {
  const stocks = await getAllDailyStocks();
  const stockBySlug = new Map(stocks.map((s) => [s.itemId, s.stock]));
  const isOpen = isShopOpen(new Date());

  const items = SHOP_CATALOG.map((item) => {
    const stock = stockBySlug.get(item.slug) ?? 0;
    return {
      ...item,
      stock,
      available: isOpen && stock > 0,
    };
  });

  return { items, isOpen };
}

/* ── 서버 측 인벤토리 응답 빌더 (inventory API 와 동일 형식) ── */

async function buildInventoryResponse(
  mainCharacterId: string | null,
): Promise<ShopInventoryResponse> {
  if (!mainCharacterId) {
    return { items: [], hasMainCharacter: false };
  }

  const catalogSlugs = SHOP_CATALOG.map((c) => c.slug);
  const masterDocs = await findMasterItemsBySlugs(catalogSlugs);

  const idToSlug = new Map<string, string>();
  for (const doc of masterDocs) {
    if (doc.slug && doc._id) idToSlug.set(String(doc._id), doc.slug);
  }

  const inventory = await listCharacterInventory(mainCharacterId);
  const items: ShopInventoryResponse["items"] = [];
  for (const row of inventory) {
    const slug = idToSlug.get(row.itemId);
    if (!slug) continue;
    const meta = findShopItemBySlug(slug);
    if (!meta) continue;
    items.push({
      itemId: row.itemId,
      slug,
      name: meta.name,
      quantity: row.quantity,
      acquiredAt: row.acquiredAt.toISOString(),
      icon: meta.icon,
      effect: meta.effect,
    });
  }

  return { items, hasMainCharacter: true };
}

/* ── 페이지 ── */

export default async function ShopPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    // 원본 메시지(메인 캐릭 codename 들 포함)는 운영 채널(Vercel 로그)에만 남기고
    // 사용자에게는 일반화된 메시지만 노출 — 자기 정보지만 운영 메시지를 직접 보여주지 않는다.
    console.error(
      `[shop] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // 카탈로그/인벤/잔액/ledger 병렬 fetch — 각각 독립적이므로 Promise.all + .catch() 폴백.
  // ledger 는 useCredits 의 initialData 시드용 (페이지 진입 시 1회 fetch 절약).
  const [initialCatalog, initialInventory, initialBalance, initialLedger] =
    await Promise.all([
      buildCatalogResponse().catch(
        (): ShopCatalogResponse => ({ items: [], isOpen: false }),
      ),
      buildInventoryResponse(mainCharacterId).catch(
        (): ShopInventoryResponse => ({
          items: [],
          hasMainCharacter: mainCharacterId !== null,
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

  // useCredits 가 받을 CreditsResponse — 메인 캐릭이 있을 때만 시드.
  const initialCredits: CreditsResponse | undefined =
    mainCharacter && mainCharacterId
      ? {
          transactions: initialLedger,
          balance: initialBalance,
          characterId: mainCharacterId,
          characterCodename: mainCharacter.codename,
        }
      : undefined;

  return (
    <ShopClient
      initialCatalog={initialCatalog}
      initialInventory={initialInventory}
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
