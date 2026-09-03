import { after, NextResponse } from "next/server";

import type {
  VttHostActionInput,
  VttHostTarget,
} from "@/types/vtt-host-control";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { performVttHostAction } from "@/lib/vtt-runtime/host-control-client";
import { reconcileCompletedVttHostAudit } from "@/lib/vtt-runtime/host-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const HOST_LABEL: Record<VttHostTarget, string> = {
  HOME: "로컬 PC",
  VPS: "Contabo VPS",
  OFFLINE: "오프라인",
};

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}

function parseActionBody(value: unknown): VttHostActionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === "SELECT_ROUTE") {
    if (
      body.targetHost !== "HOME" &&
      body.targetHost !== "VPS" &&
      body.targetHost !== "OFFLINE"
    ) {
      return null;
    }
    if (body.force !== undefined) return null;
    return {
      action: "SELECT_ROUTE",
      targetHost: body.targetHost,
    };
  }
  if (body.action === "SYNC_DATA") {
    if (
      (body.sourceHost !== "HOME" && body.sourceHost !== "VPS") ||
      (body.targetHost !== "HOME" && body.targetHost !== "VPS") ||
      body.sourceHost === body.targetHost ||
      body.force !== undefined
    ) {
      return null;
    }
    return {
      action: "SYNC_DATA",
      sourceHost: body.sourceHost,
      targetHost: body.targetHost,
    };
  }
  return null;
}

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!requestIsSameOrigin(request)) {
    return NextResponse.json(
      { error: "동일 출처의 요청만 허용됩니다.", code: "INVALID_ORIGIN" },
      { status: 403 },
    );
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_REQUEST_ID" },
      { status: 400 },
    );
  }
  const input = parseActionBody(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json(
      { error: "유효한 경로 선택 또는 데이터 동기화 요청이 필요합니다.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const result = await performVttHostAction({
    ...input,
    requestId,
    actor: {
      id: session.user.id,
      displayName: session.user.displayName,
    },
  });
  if (!result.body.ok) {
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  let auditRecorded = true;
  const isRouteAction = input.action === "SELECT_ROUTE";
  const actionLabel = isRouteAction ? "공개 경로 선택" : "데이터 동기화";
  const actionSummary = isRouteAction
    ? `${HOST_LABEL[input.targetHost]} 경로 선택 요청 · 컨트롤러 접수`
    : `${HOST_LABEL[input.sourceHost]} → ${HOST_LABEL[input.targetHost]} 데이터 동기화 요청 · 컨트롤러 접수`;
  try {
    await scheduleGmAdminAudit(
      {
        action: `Nochichim VTT ${actionLabel} 요청 접수`,
        actor: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
        summary: actionSummary,
        target: "nochiijjim.com",
        details: [
          { name: "요청 ID", value: requestId },
          {
            name: "감사 범위",
            value: `컨트롤러가 ${actionLabel} 요청을 접수한 사실`,
          },
          { name: "작업", value: actionLabel },
          ...(input.action === "SYNC_DATA"
            ? [
                { name: "데이터 원본", value: HOST_LABEL[input.sourceHost] },
                { name: "데이터 대상", value: HOST_LABEL[input.targetHost] },
              ]
            : [
                { name: "대상 경로", value: HOST_LABEL[input.targetHost] },
              ]),
        ],
        timestamp: new Date(result.body.requestedAt),
      },
      { dedupeKey: `vtt-host:${requestId}` },
    );
  } catch (error) {
    auditRecorded = false;
    console.error(
      "[admin/vtt-hosts] audit enqueue failed",
      { requestId, error: error instanceof Error ? error.message : "unknown" },
    );
  }

  const successfulStatus = result.body.status;
  after(async () => {
    try {
      await reconcileCompletedVttHostAudit(successfulStatus);
    } catch (error) {
      console.error("[admin/vtt-hosts] completion audit enqueue failed", {
        requestId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });

  return NextResponse.json(
    {
      ...result.body,
      auditRecorded,
      ...(!auditRecorded
        ? { warning: "작업 요청은 접수됐지만 감사 기록 적재에 실패했습니다." }
        : {}),
    },
    {
      status: result.status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(result.body.replayed ? { "X-Idempotency-Replayed": "true" } : {}),
      },
    },
  );
}
