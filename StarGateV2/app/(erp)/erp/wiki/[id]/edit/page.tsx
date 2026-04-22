import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { findWikiPageById } from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";

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

  return (
    <WikiEditForm
      initialCategory={page.category}
      initialContent={page.content}
      initialIsPublic={page.isPublic}
      initialTags={page.tags}
      initialTitle={page.title}
      pageId={page._id!.toString()}
    />
  );
}
