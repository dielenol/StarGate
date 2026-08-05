import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  validateSessionReportArrays,
  validateSessionReportCoreText,
  validateSessionReportMap,
  validateSessionReportReferences,
} from "@/lib/api/session-report-validators";
import {
  createSessionReport,
  listSessionReports,
  SessionReportAlreadyExistsError,
  SessionReportReferenceTargetError,
  SessionReportReferenceConflictError,
  SessionReportSourceNotFoundError,
} from "@/lib/db/session-reports";
import { describeSessionReportReferenceTargetIssues } from "@/lib/api/session-report-reference-targets";
import { notifyActiveUsers } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { getClient } from "@/lib/db/client";
import { readJsonObjectBody } from "@/lib/api/json-body";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reports = await listSessionReports();
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "private, no-store" } },
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

  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.value;
  const core = validateSessionReportCoreText(body);
  if ("error" in core) return core.error;
  const { sessionId, summary } = core.value;
  if (!sessionId || !summary) {
    return NextResponse.json(
      { error: "sessionId와 summary는 필수입니다." },
      { status: 400 },
    );
  }

  const arrays = validateSessionReportArrays(body);
  if ("error" in arrays) return arrays.error;
  const { highlights, participants } = arrays.value;
  const map = validateSessionReportMap(body);
  if ("error" in map) return map.error;
  const references = validateSessionReportReferences(body);
  if ("error" in references) return references.error;

  try {
    // V 이상은 실제 등록된 어느 세션에도 보고서를 작성할 수 있다. 제목은
    // query/body가 아니라 세션 SSOT에서 파생한다. 원본 조회와 write-lock도
    // report insert와 같은 transaction에 넣어 삭제/수정 경합의 orphan을 차단한다.
    const mongoSession = (await getClient()).startSession();
    let report: Awaited<ReturnType<typeof createSessionReport>> | null = null;
    try {
      report =
        (await mongoSession.withTransaction(async () => {
          const created = await createSessionReport(
            {
              sessionId,
              summary,
              highlights: highlights ?? [],
              participants: participants ?? [],
              ...references.value,
              ...map.value,
              gmId: session.user.id,
              gmName: session.user.displayName,
            },
            { session: mongoSession },
          );
          await scheduleGmAdminAudit(
            {
              action: "세션 리포트 발행",
              actor: {
                id: session.user.id,
                displayName: session.user.displayName,
                role: session.user.role,
              },
              summary: `참여자 ${created.participants.length}명 · 하이라이트 ${created.highlights.length}건`,
              target: created.sessionTitle,
              timestamp: new Date(),
            },
            { session: mongoSession },
          );
          return created;
        })) ?? null;
    } finally {
      await mongoSession.endSession();
    }
    if (!report) throw new Error("세션 리포트 transaction 결과가 없습니다.");
    try {
      await notifyActiveUsers(
        {
          type: "REPORT_PUBLISHED",
          title: "새 작전 보고서가 발행되었습니다",
          message: report.sessionTitle,
          link: `/erp/sessions/report/${String(report._id)}`,
        },
        { excludeUserIds: [session.user.id] },
      );
    } catch (notificationError) {
      console.error(
        "session report notification failed after commit",
        notificationError,
      );
    }

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof SessionReportAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SessionReportSourceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SessionReportReferenceTargetError) {
      const response = describeSessionReportReferenceTargetIssues(error.issues);
      return NextResponse.json({ error: response.error }, { status: response.status });
    }
    if (error instanceof SessionReportReferenceConflictError) {
      return NextResponse.json(
        { error: "구조화 로어 링크 대상이 동시에 변경되었습니다. 다시 시도하세요." },
        { status: 409 },
      );
    }
    if (error instanceof MongoServerError && error.code === 11_000) {
      return NextResponse.json(
        { error: "같은 sessionId의 작전 보고서가 이미 존재합니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "리포트 생성 실패" }, { status: 500 });
  }
}
