import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listWikiPages,
  listWikiPagesByCategory,
  searchWikiPages,
} from "@/lib/db/wiki";

import WikiClient from "./WikiClient";

interface WikiListPageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
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

  let pages: Awaited<ReturnType<typeof listWikiPages>> = [];
  let allPages: Awaited<ReturnType<typeof listWikiPages>> = [];

  try {
    if (q || category) {
      const [filtered, all] = await Promise.all([
        q ? searchWikiPages(q) : listWikiPagesByCategory(category!),
        listWikiPages(),
      ]);
      pages = filtered;
      allPages = all;
    } else {
      pages = await listWikiPages();
      allPages = pages;
    }
  } catch {
    pages = [];
    allPages = [];
  }

  const categories = [...new Set(allPages.map((p) => p.category))].sort();

  return (
    <WikiClient
      initialPages={pages}
      categories={categories}
      currentCategory={category}
      currentQuery={q}
      isGM={isGM}
    />
  );
}
