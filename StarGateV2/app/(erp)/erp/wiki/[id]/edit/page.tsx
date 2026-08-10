import { notFound, redirect } from "next/navigation";

import { getActiveSession } from "@/lib/auth/active-session";
import { requireRole } from "@/lib/auth/rbac";
import { findWikiPageById } from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";
import { toWikiPageClient } from "@/lib/wiki/client-page";

import WikiEditForm from "./WikiEditForm";

interface WikiEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function WikiEditPage({ params }: WikiEditPageProps) {
  const session = await getActiveSession();
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
  const initialPage = toWikiPageClient(page);

  return <WikiEditForm initialPage={initialPage} />;
}
