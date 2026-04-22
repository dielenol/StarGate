import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  createSessionReport,
  listSessionReports,
} from "@/lib/db/session-reports";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reports = await listSessionReports();
    return NextResponse.json(
      { reports },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "리포트 목록 조회 실패" },
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

  const body = await request.json();
  const { sessionId, sessionTitle, summary, highlights, participants } =
    body as {
      sessionId?: string;
      sessionTitle?: string;
      summary?: string;
      highlights?: string[];
      participants?: string[];
    };

  if (!sessionTitle?.trim() || !summary?.trim()) {
    return NextResponse.json(
      { error: "sessionTitle과 summary는 필수입니다." },
      { status: 400 },
    );
  }

  try {
    const report = await createSessionReport({
      sessionId: sessionId?.trim() ?? "",
      sessionTitle: sessionTitle.trim(),
      summary: summary.trim(),
      highlights: highlights ?? [],
      participants: participants ?? [],
      gmId: session.user.id,
      gmName: session.user.displayName,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "리포트 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
