import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { findWikiPageById } from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";
import type { WikiPageClient } from "@/types/wiki";

import WikiEditForm from "./WikiEditForm";

interface WikiEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function WikiEditPage({ params }: WikiEditPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    redirect("/erp/wiki");
  }

  const { id } = await params;
  if (!isValidObjectId(id)) notFound();

  const page = await findWikiPageById(id);
  if (!page) notFound();
  const initialPage: WikiPageClient = {
    ...page,
    _id: page._id?.toString() ?? id,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt?.toISOString() ?? "",
  };

  return <WikiEditForm initialPage={initialPage} />;
}
