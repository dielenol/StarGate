import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { sanitizeWikiBody } from "@/lib/api/wiki-validators";
import {
  deleteWikiPage,
  findWikiPageById,
  updateWikiPage,
} from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

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
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const sanitized = sanitizeWikiBody(await request.json());
  if ("error" in sanitized) return sanitized.error;

  try {
    const updated = await updateWikiPage(
      id,
      sanitized.value,
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
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

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
