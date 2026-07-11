import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { sanitizeWikiBody } from "@/lib/api/wiki-validators";
import {
  createWikiPage,
  listWikiPages,
  listWikiPagesByCategory,
  searchWikiPages,
} from "@/lib/db/wiki";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

function normalizeTags(tags?: string[]): string[] {
  return tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  try {
    let pages;

    if (q) {
      pages = await searchWikiPages(q);
    } else if (category) {
      pages = await listWikiPagesByCategory(category);
    } else {
      pages = await listWikiPages();
    }

    return NextResponse.json(
      { pages },
      {
        headers: {
          "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "위키 목록 조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sanitized = sanitizeWikiBody(await request.json());
  if ("error" in sanitized) return sanitized.error;
  const { slug, title, content, category, tags, isPublic } = sanitized.value;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "제목과 내용은 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const page = await createWikiPage({
      slug: slug?.trim() ?? "",
      title: title.trim(),
      content: content.trim(),
      category: category?.trim() || "미분류",
      tags: normalizeTags(tags),
      isPublic: isPublic ?? true,
      authorId: session.user.id,
      authorName: session.user.displayName,
    });

    scheduleGmAdminAudit({
      action: "위키 문서 생성",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${page.category} · ${page.isPublic ? "공개" : "비공개"}`,
      target: page.title,
      timestamp: new Date(),
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문서 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
