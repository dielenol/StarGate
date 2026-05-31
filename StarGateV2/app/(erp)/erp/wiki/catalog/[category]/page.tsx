import { notFound, redirect } from "next/navigation";
import type { ItemCategory } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";

import CatalogClient from "./CatalogClient";

type Category = "all" | "equipment" | "consumable" | "material" | "special";

const CATEGORY_MAP: Record<Category, ItemCategory[]> = {
  all: ["WEAPON", "ARMOR", "CONSUMABLE", "MATERIAL", "SPECIAL"],
  equipment: ["WEAPON", "ARMOR"],
  consumable: ["CONSUMABLE"],
  material: ["MATERIAL"],
  special: ["SPECIAL"],
};

const CATEGORY_LABEL: Record<Category, string> = {
  all: "카탈로그",
  equipment: "장비 카탈로그",
  consumable: "소모품 카탈로그",
  material: "샘플 카탈로그",
  special: "특수 카탈로그",
};

function isCategory(value: string): value is Category {
  return (
    value === "all" ||
    value === "equipment" ||
    value === "consumable" ||
    value === "material" ||
    value === "special"
  );
}

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
  if (!isCategory(category)) {
    notFound();
  }

  const itemCategories = CATEGORY_MAP[category];

  // TODO(perf): N>500 시 shared-db 측 listMasterItemsByCategory(인덱스 활용) 도입 후 wrapper 폐기.
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
      category={category}
      label={CATEGORY_LABEL[category]}
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
