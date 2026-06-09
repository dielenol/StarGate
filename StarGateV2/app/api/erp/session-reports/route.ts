import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  validateSessionReportArrays,
  validateSessionReportMap,
} from "@/lib/api/session-report-validators";
import {
  createSessionReport,
  listSessionReports,
} from "@/lib/db/session-reports";
import { notifyActiveUsers } from "@/lib/notifications/events";

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
          "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
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
  const { sessionId, sessionTitle, summary } = body as {
    sessionId?: string;
    sessionTitle?: string;
    summary?: string;
  };

  if (!sessionTitle?.trim() || !summary?.trim()) {
    return NextResponse.json(
      { error: "sessionTitle과 summary는 필수입니다." },
      { status: 400 },
    );
  }

  const arrays = validateSessionReportArrays(body);
  if ("error" in arrays) return arrays.error;
  const { highlights, participants } = arrays.value;
  const map = validateSessionReportMap(body);
  if ("error" in map) return map.error;

  try {
    const report = await createSessionReport({
      sessionId: sessionId?.trim() ?? "",
      sessionTitle: sessionTitle.trim(),
      summary: summary.trim(),
      highlights: highlights ?? [],
      participants: participants ?? [],
      ...map.value,
      gmId: session.user.id,
      gmName: session.user.displayName,
    });
    await notifyActiveUsers(
      {
        type: "REPORT_PUBLISHED",
        title: "새 작전 보고서가 발행되었습니다",
        message: report.sessionTitle,
        link: `/erp/sessions/report/${String(report._id)}`,
      },
      { excludeUserIds: [session.user.id] },
    );

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "리포트 생성 실패";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
