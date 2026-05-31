import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listWikiPages } from "@/lib/db/wiki";

import WikiClient from "./WikiClient";
import { sortWikiCategories } from "./wiki-display";

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

  let allPages: Awaited<ReturnType<typeof listWikiPages>> = [];

  try {
    allPages = await listWikiPages();
  } catch {
    allPages = [];
  }

  const categories = sortWikiCategories([
    ...new Set(allPages.map((p) => p.category)),
  ]);

  return (
    <WikiClient
      initialPages={allPages}
      allPages={allPages}
      categories={categories}
      currentCategory={category}
      currentQuery={q}
      isGM={isGM}
    />
  );
}
