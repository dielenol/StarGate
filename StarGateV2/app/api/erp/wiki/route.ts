import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  createWikiPage,
  listWikiPages,
  listWikiPagesByCategory,
  searchWikiPages,
} from "@/lib/db/wiki";

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

    return NextResponse.json({ pages });
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
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { title, content, category, tags, isPublic } = body as {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
  };

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "제목과 내용은 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const page = await createWikiPage({
      slug: "",
      title: title.trim(),
      content: content.trim(),
      category: category?.trim() ?? "미분류",
      tags: tags ?? [],
      isPublic: isPublic ?? false,
      authorId: session.user.id,
      authorName: session.user.displayName,
    });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문서 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
