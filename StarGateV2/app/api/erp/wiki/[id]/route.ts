import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import {
  isExpectedUpdatedAtCurrent,
  parseExpectedUpdatedAt,
} from "@/lib/api/expected-updated-at";
import { sanitizeWikiBody } from "@/lib/api/wiki-validators";
import {
  deleteWikiPage,
  findWikiPageById,
  findVisibleWikiPageById,
  updateWikiPage,
} from "@/lib/db/wiki";
import { isValidObjectId } from "@/lib/db/utils";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { getClient } from "@/lib/db/client";
import { readJsonObjectBody } from "@/lib/api/json-body";
import { SessionReportInboundReferenceError } from "@/lib/db/session-reports";
import { toWikiPageClient } from "@/lib/wiki/client-page";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeWikiUpdate(
  update: Record<string, unknown>,
): NextResponse | null {
  if (typeof update.title === "string") {
    const title = update.title.trim();
    if (!title) return badRequest("title은 비워둘 수 없습니다.");
    update.title = title;
  }

  if (typeof update.content === "string") {
    const content = update.content.trim();
    if (!content) return badRequest("content는 비워둘 수 없습니다.");
    update.content = content;
  }

  if (typeof update.category === "string") {
    update.category = update.category.trim();
  }

  if (Array.isArray(update.tags)) {
    update.tags = update.tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
  }

  return null;
}

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
    const page = await findVisibleWikiPageById(id, {
      includePrivate: hasRole(session.user.role, "V"),
    });
    if (!page) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ page: toWikiPageClient(page) });
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
  const sanitized = sanitizeWikiBody(body);
  if ("error" in sanitized) return sanitized.error;
  const update: Record<string, unknown> = { ...sanitized.value };
  delete update.slug;
  const normalizeError = normalizeWikiUpdate(update);
  if (normalizeError) return normalizeError;
  if (Object.keys(update).length === 0) {
    return badRequest("수정할 위키 필드가 없습니다.");
  }

  try {
    const before = await findWikiPageById(id);
    if (
      before &&
      !isExpectedUpdatedAtCurrent(before.updatedAt, expectedUpdatedAt.value)
    ) {
      return NextResponse.json(
        {
          error:
            "다른 사용자가 문서를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
          code: "STALE_VERSION",
        },
        { status: 409 },
      );
    }
    const mongoSession = (await getClient()).startSession();
    let updated = false;
    try {
      await mongoSession.withTransaction(async () => {
        updated = false;
        updated = await updateWikiPage(
          id,
          update,
          session.user.id,
          session.user.displayName,
          expectedUpdatedAt.value,
          { session: mongoSession },
        );
        if (!updated) return;
        await scheduleGmAdminAudit(
          {
            action: "위키 문서 수정",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `변경 필드: ${Object.keys(update).join(", ")}`,
            target: typeof update.title === "string" ? update.title : id,
            timestamp: new Date(),
          },
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    if (!updated) {
      const latest = await findWikiPageById(id);
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
              "다른 사용자가 문서를 수정했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
            code: "STALE_VERSION",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "문서를 찾을 수 없거나 변경사항이 없습니다." },
        { status: 404 },
      );
    }

    const current = await findWikiPageById(id);
    return NextResponse.json({
      success: true,
      updatedAt: current?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof SessionReportInboundReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("wiki update failed", error);
    return NextResponse.json({ error: "문서 수정 실패" }, { status: 500 });
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
        deleted = await deleteWikiPage(id, expectedUpdatedAt.value, {
          session: mongoSession,
        });
        if (!deleted) return;
        await scheduleGmAdminAudit(
          {
            action: "위키 문서 삭제",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: "위키 문서 영구 삭제",
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
      const latest = await findWikiPageById(id);
      if (
        latest &&
        !isExpectedUpdatedAtCurrent(latest.updatedAt, expectedUpdatedAt.value)
      ) {
        return NextResponse.json(
          { error: "다른 사용자가 문서를 수정했습니다.", code: "STALE_VERSION" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SessionReportInboundReferenceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "문서 삭제 실패" },
      { status: 500 },
    );
  }
}
