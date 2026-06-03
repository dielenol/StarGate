import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listWikiPages } from "@/lib/db/wiki";
import type { WikiPage, WikiPageClient } from "@/types/wiki";

import WikiClient from "./WikiClient";
import { sortWikiCategories } from "./wiki-display";

interface WikiListPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

function serializeWikiPage(page: WikiPage): WikiPageClient {
  return {
    _id: page._id?.toString() ?? "",
    slug: page.slug,
    title: page.title,
    content: page.content,
    category: page.category,
    tags: page.tags,
    isPublic: page.isPublic,
    authorId: page.authorId,
    authorName: page.authorName,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

export default async function WikiListPage({
  searchParams,
}: WikiListPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { category, q } = await searchParams;
  const isGM = hasRole(session.user.role, "V");

  let allPages: Awaited<ReturnType<typeof listWikiPages>> = [];

  try {
    allPages = await listWikiPages();
  } catch {
    allPages = [];
  }

  const categories = sortWikiCategories([
    ...new Set(allPages.map((p) => p.category)),
  ]);
  const serializedPages = allPages.map(serializeWikiPage);

  return (
    <WikiClient
      initialPages={serializedPages}
      allPages={serializedPages}
      categories={categories}
      currentCategory={category}
      currentQuery={q}
      isGM={isGM}
    />
  );
}
