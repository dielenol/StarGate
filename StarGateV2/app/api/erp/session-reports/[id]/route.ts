import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  deleteSessionReport,
  findReportById,
  updateSessionReport,
} from "@/lib/db/session-reports";
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
    const report = await findReportById(id);
    if (!report) {
      return NextResponse.json(
        { error: "리포트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ report });
  } catch {
    return NextResponse.json(
      { error: "리포트 조회 실패" },
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
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }
  const body = await request.json();
  const { sessionTitle, summary, highlights, participants } = body as {
    sessionTitle?: string;
    summary?: string;
    highlights?: string[];
    participants?: string[];
  };

  try {
    const update: Record<string, unknown> = {};
    if (sessionTitle !== undefined) update.sessionTitle = sessionTitle.trim();
    if (summary !== undefined) update.summary = summary.trim();
    if (highlights !== undefined) update.highlights = highlights;
    if (participants !== undefined) update.participants = participants;

    const updated = await updateSessionReport(id, update);
    if (!updated) {
      return NextResponse.json(
        { error: "리포트를 찾을 수 없거나 변경사항이 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "리포트 수정 실패";
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
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const deleted = await deleteSessionReport(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "리포트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "리포트 삭제 실패" },
      { status: 500 },
    );
  }
}
