import { notFound, redirect } from "next/navigation";
import type { ItemCategory } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import {
  CATALOG_SCOPE_CATEGORIES,
  CATALOG_SCOPE_HREF,
  CATALOG_SCOPE_TITLE,
  normalizeCatalogScope,
} from "@/lib/catalog/categories";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";

import CatalogClient from "./CatalogClient";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  // 카탈로그 = U 이상 ERP 전체 노출 정책. minRole 추가 게이트 필요 시
  // hasRole(session.user.role, "U") 등을 명시적으로 추가.
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { category } = await params;
  const scope = normalizeCatalogScope(category);
  if (!scope) {
    notFound();
  }
  if (category !== scope) {
    redirect(CATALOG_SCOPE_HREF[scope]);
  }

  const itemCategories = CATALOG_SCOPE_CATEGORIES[scope];

  let items: Awaited<ReturnType<typeof listMasterItemsByCategoryFilter>> = [];
  try {
    items = await listMasterItemsByCategoryFilter(itemCategories, {
      availableOnly: false,
    });
  } catch (err) {
    // shared-db 초기화 실패 / Mongo 일시 장애 시 빈 카탈로그 렌더로 폴백.
    console.error("[wiki/catalog] listMasterItemsByCategoryFilter failed", err);
  }

  return (
    <CatalogClient
      category={scope}
      label={CATALOG_SCOPE_TITLE[scope]}
      initialItems={items
        // wrapper(listMasterItemsByCategoryFilter)가 이미 category를 좁히지만,
        // 향후 호출처가 바뀌어도 안전하게 type predicate로 한 번 더 가드.
        .filter(
          (it): it is typeof it & { category: ItemCategory } =>
            itemCategories.includes(it.category),
        )
        .map((it) => ({
          _id: it._id?.toString() ?? "",
          slug: it.slug,
          name: it.name,
          category: it.category,
          description: it.description,
          price: it.price,
          damage: it.damage,
          effect: it.effect,
          tags: it.tags,
          isAvailable: it.isAvailable,
        }))}
    />
  );
}
