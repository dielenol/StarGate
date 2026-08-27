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
  if (
    body.targetHost !== "HOME" &&
    body.targetHost !== "VPS" &&
    body.targetHost !== "OFFLINE"
  ) {
    return null;
  }
  if (body.force !== undefined && typeof body.force !== "boolean") return null;
  return {
    targetHost: body.targetHost,
    ...(body.force === true ? { force: true } : {}),
  };
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
      { error: "targetHost는 HOME, VPS, OFFLINE 중 하나여야 합니다.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const result = await performVttHostAction({
    action: "SWITCH_HOST",
    targetHost: input.targetHost,
    requestId,
    force: input.force === true,
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
  try {
    await scheduleGmAdminAudit(
      {
        action: "Nochichim VTT 호스트 전환 요청 접수",
        actor: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
        summary: `${HOST_LABEL[input.targetHost]} 전환 요청 · 컨트롤러 접수`,
        target: "nochiijjim.com",
        details: [
          { name: "요청 ID", value: requestId },
          {
            name: "감사 범위",
            value: "컨트롤러가 전환 요청을 접수한 사실",
          },
          { name: "대상 호스트", value: HOST_LABEL[input.targetHost] },
          { name: "접속자 재확인", value: input.force === true ? "예" : "아니오" },
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
        ? { warning: "전환 요청은 접수됐지만 감사 기록 적재에 실패했습니다." }
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
