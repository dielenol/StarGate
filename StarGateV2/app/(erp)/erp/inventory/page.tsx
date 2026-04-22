import { redirect } from "next/navigation";

import type { ItemCategory } from "@/types/inventory";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { listMasterItems } from "@/lib/db/inventory";

import InventoryClient from "./InventoryClient";

interface InventoryPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { role } = session.user;
  const isGm = hasRole(role, "V");

  const resolvedParams = await searchParams;
  const categoryFilter = resolvedParams.category as ItemCategory | undefined;

  const allItems = await listMasterItems().catch(() => []);

  return (
    <InventoryClient
      initialItems={allItems}
      categoryFilter={categoryFilter ?? null}
      isGm={isGm}
    />
  );
}
