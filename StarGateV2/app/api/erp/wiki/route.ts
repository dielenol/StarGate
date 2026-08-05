import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { sanitizeWikiBody } from "@/lib/api/wiki-validators";
import {
  createWikiPage,
  InvalidWikiPageCursorError,
  listWikiPageSummaries,
} from "@/lib/db/wiki";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { getClient } from "@/lib/db/client";
import { readJsonObjectBody } from "@/lib/api/json-body";

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
  const cursor = searchParams.get("cursor");
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 20;
  if (q && q.trim().length > 120) {
    return NextResponse.json(
      { error: "검색어는 120자 이하여야 합니다." },
      { status: 400 },
    );
  }
  if (category && category.length > 80) {
    return NextResponse.json(
      { error: "category는 80자 이하여야 합니다." },
      { status: 400 },
    );
  }
  if (cursor && cursor.length > 512) {
    return NextResponse.json(
      { error: "cursor가 너무 깁니다." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: "limit은 1 이상 50 이하의 정수여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const result = await listWikiPageSummaries({
      category: category ?? undefined,
      cursor: cursor ?? undefined,
      includePrivate: hasRole(session.user.role, "V"),
      limit,
      query: q ?? undefined,
    });

    return NextResponse.json(
      {
        ...result,
        pages: result.pages.map((page) => ({
          ...page,
          _id: page._id.toString(),
          createdAt: page.createdAt.toISOString(),
          updatedAt: page.updatedAt.toISOString(),
        })),
        recent: result.recent.map((page) => ({
          ...page,
          _id: page._id.toString(),
          createdAt: page.createdAt.toISOString(),
          updatedAt: page.updatedAt.toISOString(),
        })),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof InvalidWikiPageCursorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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

  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const sanitized = sanitizeWikiBody(parsedBody.value);
  if ("error" in sanitized) return sanitized.error;
  const { slug, title, content, category, tags, isPublic } = sanitized.value;

  if (!title?.trim() || !content?.trim() || !category) {
    return NextResponse.json(
      { error: "제목, 내용과 카테고리는 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const mongoSession = (await getClient()).startSession();
    let page: Awaited<ReturnType<typeof createWikiPage>> | null = null;
    try {
      page =
        (await mongoSession.withTransaction(async () => {
        const created = await createWikiPage(
          {
            slug: slug?.trim() ?? "",
            title: title.trim(),
            content: content.trim(),
            category,
            tags: normalizeTags(tags),
            isPublic: isPublic ?? true,
            authorId: session.user.id,
            authorName: session.user.displayName,
          },
          { session: mongoSession },
        );
        await scheduleGmAdminAudit(
          {
            action: "위키 문서 생성",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${created.category} · ${created.isPublic ? "공개" : "비공개"}`,
            target: created.title,
            timestamp: new Date(),
          },
          { session: mongoSession },
        );
          return created;
        })) ?? null;
    } finally {
      await mongoSession.endSession();
    }
    if (!page) throw new Error("위키 문서 transaction 결과가 없습니다.");

    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11_000) {
      return NextResponse.json(
        {
          error: "같은 slug의 위키 문서가 이미 존재합니다.",
          code: "WIKI_SLUG_CONFLICT",
        },
        { status: 409 },
      );
    }
    console.error("wiki create failed", error);
    return NextResponse.json({ error: "문서 생성 실패" }, { status: 500 });
  }
}
