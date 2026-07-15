import { notFound, redirect } from "next/navigation";
import type { ItemCategory } from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  CATALOG_SCOPE_CATEGORIES,
  CATALOG_SCOPE_HREF,
  normalizeCatalogScope,
} from "@/lib/catalog/categories";
import { listVisibleMasterItems } from "@/lib/db/inventory";

import CatalogClient from "./CatalogClient";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
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

  const allCatalogCategories = CATALOG_SCOPE_CATEGORIES.all;

  let items: Awaited<ReturnType<typeof listVisibleMasterItems>> = [];
  try {
    items = await listVisibleMasterItems({
      userId: session.user.id,
      includePrivate: hasRole(session.user.role, "V"),
    }, {
      categories: allCatalogCategories,
      availableOnly: false,
    });
  } catch (err) {
    console.error("[wiki/catalog] listMasterItemsByCategoryFilter failed", err);
  }

  return (
    <CatalogClient
      category={scope}
      initialItems={items
        .filter(
          (it): it is typeof it & { category: ItemCategory } =>
            allCatalogCategories.includes(it.category),
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
          previewImage: it.previewImage,
          tags: it.tags,
          isAvailable: it.isAvailable,
          isPublic: it.isPublic,
          workshop: it.workshop,
          createdAt: it.createdAt,
          updatedAt: it.updatedAt,
        }))}
    />
  );
}
