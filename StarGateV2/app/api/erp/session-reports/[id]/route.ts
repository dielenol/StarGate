import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  isExpectedUpdatedAtCurrent,
  parseExpectedUpdatedAt,
} from "@/lib/api/expected-updated-at";
import {
  validateSessionReportArrays,
  validateSessionReportCoreText,
  validateSessionReportMapUpdate,
  validateSessionReportReferences,
} from "@/lib/api/session-report-validators";
import {
  deleteSessionReport,
  findReportById,
  sanitizeSessionReportReferencesForPublicTargets,
  SessionReportReferenceTargetError,
  SessionReportReferenceConflictError,
  SessionReportSourceNotFoundError,
  updateSessionReport,
} from "@/lib/db/session-reports";
import { describeSessionReportReferenceTargetIssues } from "@/lib/api/session-report-reference-targets";
import { isValidObjectId } from "@/lib/db/utils";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { getClient } from "@/lib/db/client";
import { readJsonObjectBody } from "@/lib/api/json-body";

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

    const [safeReport] =
      await sanitizeSessionReportReferencesForPublicTargets([report]);
    return NextResponse.json({ report: safeReport });
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
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }
  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.value;
  const expectedUpdatedAt = parseExpectedUpdatedAt(body);
  if (!expectedUpdatedAt.ok) {
    return NextResponse.json(
      { error: expectedUpdatedAt.error },
      { status: 400 },
    );
  }
  const core = validateSessionReportCoreText(body);
  if ("error" in core) return core.error;
  const { summary } = core.value;
  if (body.sessionTitle !== undefined) {
    return NextResponse.json(
      { error: "sessionTitle은 연결된 세션에서 파생되므로 수정할 수 없습니다." },
      { status: 400 },
    );
  }

  const arrays = validateSessionReportArrays(body);
  if ("error" in arrays) return arrays.error;
  const { highlights, participants } = arrays.value;
  const map = validateSessionReportMapUpdate(body);
  if ("error" in map) return map.error;
  const references = validateSessionReportReferences(body);
  if ("error" in references) return references.error;

  try {
    const before = await findReportById(id);
    if (
      before &&
      !isExpectedUpdatedAtCurrent(before.updatedAt, expectedUpdatedAt.value)
    ) {
      return NextResponse.json(
        {
          error:
            "다른 사용자가 리포트를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
          code: "STALE_VERSION",
        },
        { status: 409 },
      );
    }
    const update: Record<string, unknown> = {};
    if (summary !== undefined) update.summary = summary;
    if (highlights !== undefined) update.highlights = highlights;
    if (participants !== undefined) update.participants = participants;
    Object.assign(update, references.value);
    Object.assign(update, map.value);
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "수정할 리포트 필드가 없습니다." },
        { status: 400 },
      );
    }

    const mongoSession = (await getClient()).startSession();
    let updated = false;
    try {
      await mongoSession.withTransaction(async () => {
        updated = false;
        updated = await updateSessionReport(
          id,
          update,
          expectedUpdatedAt.value,
          { session: mongoSession },
        );
        if (!updated) return;
        await scheduleGmAdminAudit(
          {
            action: "세션 리포트 수정",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `변경 필드: ${Object.keys(update).join(", ")}`,
            target: before?.sessionTitle || id,
            timestamp: new Date(),
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    if (!updated) {
      const latest = await findReportById(id);
      if (
        latest &&
        !isExpectedUpdatedAtCurrent(
          latest.updatedAt,
          expectedUpdatedAt.value,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "다른 사용자가 리포트를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
            code: "STALE_VERSION",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "리포트를 찾을 수 없거나 변경사항이 없습니다." },
        { status: 404 },
      );
    }

    const current = await findReportById(id);
    return NextResponse.json({
      success: true,
      updatedAt: current?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof SessionReportSourceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
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
    console.error("session report update failed", error);
    return NextResponse.json({ error: "리포트 수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
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
  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsedBody.value);
  if (!expectedUpdatedAt.ok) {
    return NextResponse.json({ error: expectedUpdatedAt.error }, { status: 400 });
  }

  try {
    const mongoSession = (await getClient()).startSession();
    let deleted = false;
    try {
      await mongoSession.withTransaction(async () => {
        deleted = false;
        deleted = await deleteSessionReport(id, expectedUpdatedAt.value, {
          session: mongoSession,
        });
        if (!deleted) return;
        await scheduleGmAdminAudit(
          {
            action: "세션 리포트 삭제",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: "세션 리포트 영구 삭제",
            target: id,
            timestamp: new Date(),
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    if (!deleted) {
      const latest = await findReportById(id);
      if (
        latest &&
        !isExpectedUpdatedAtCurrent(latest.updatedAt, expectedUpdatedAt.value)
      ) {
        return NextResponse.json(
          { error: "다른 사용자가 리포트를 수정했습니다.", code: "STALE_VERSION" },
          { status: 409 },
        );
      }
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
