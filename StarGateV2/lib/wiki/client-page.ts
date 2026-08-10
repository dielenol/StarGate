import type { WikiPage } from "@stargate/shared-db/types";

import type { WikiPageClient } from "@/types/wiki";

function serializeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

/** Client/API에 필요한 공개 위키 필드만 명시적으로 직렬화한다. */
export function toWikiPageClient(page: WikiPage): WikiPageClient {
  return {
    _id: page._id?.toString() ?? "",
    slug: page.slug,
    title: page.title,
    content: page.content,
    category: page.category,
    tags: page.tags,
    isPublic: page.isPublic,
    authorName: page.authorName,
    createdAt: serializeDate(page.createdAt),
    updatedAt: serializeDate(page.updatedAt),
  };
}
