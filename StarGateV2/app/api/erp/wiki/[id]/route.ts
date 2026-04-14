import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  deleteWikiPage,
  findWikiPageById,
  updateWikiPage,
} from "@/lib/db/wiki";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const page = await findWikiPageById(id);
    if (!page) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ page });
  } catch {
    return NextResponse.json(
      { error: "문서 조회 실패" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { title, content, category, tags, isPublic } = body as {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
  };

  try {
    const updated = await updateWikiPage(
      id,
      { title, content, category, tags, isPublic },
      session.user.id,
      session.user.displayName,
    );

    if (!updated) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없거나 변경사항이 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "문서 수정 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "ADMIN");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteWikiPage(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "문서 삭제 실패" },
      { status: 500 },
    );
  }
}
