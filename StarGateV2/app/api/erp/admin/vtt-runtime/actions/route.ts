import { NextResponse } from "next/server";

import type { VttRuntimeActionInput } from "@/types/vtt-runtime";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { performVttRuntimeAction } from "@/lib/vtt-runtime/control-client";
import {
  getVttHostStatus,
  isVttHostControlModeEnabled,
} from "@/lib/vtt-runtime/host-control-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

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

function parseActionBody(value: unknown): VttRuntimeActionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action !== "START" && body.action !== "STOP") return null;
  if (body.force !== undefined && typeof body.force !== "boolean") return null;
  if (
    body.homeStoppedConfirmed !== undefined &&
    typeof body.homeStoppedConfirmed !== "boolean"
  ) return null;
  if (body.action === "START") {
    if (body.force === true) return null;
    return {
      action: "START",
      ...(body.homeStoppedConfirmed === true
        ? { homeStoppedConfirmed: true }
        : {}),
    };
  }
  if (body.homeStoppedConfirmed !== undefined) return null;
  return {
    action: "STOP",
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
      {
        error: "action은 START 또는 STOP이며 force는 STOP, HOME 종료 확인은 START에서만 허용됩니다.",
        code: "INVALID_BODY",
      },
      { status: 400 },
    );
  }

  if (input.action === "START" && isVttHostControlModeEnabled()) {
    const hostStatus = await getVttHostStatus();
    if (!hostStatus.controlEnabled || hostStatus.state === "UNREACHABLE") {
      return NextResponse.json(
        {
          error: "공개 경로 제어 상태를 확인할 수 없어 VPS 시작을 차단했습니다.",
          code: "HOST_CONTROL_UNREACHABLE",
        },
        { status: 503 },
      );
    }
    if (hostStatus.transition || hostStatus.state === "RECOVERY_REQUIRED") {
      return NextResponse.json(
        {
          error: "경로 변경·동기화 또는 수동 복구가 진행 중이라 VPS 시작을 차단했습니다.",
          code: "HOST_OPERATION_LOCKED",
        },
        { status: 423 },
      );
    }
    if (hostStatus.routeHost !== "VPS") {
      return NextResponse.json(
        {
          error: "VPS Tunnel 경로를 먼저 ON으로 선택해야 앱을 시작할 수 있습니다.",
          code: "VPS_ROUTE_NOT_SELECTED",
        },
        { status: 409 },
      );
    }
    if (!hostStatus.hosts.VPS.reachable) {
      return NextResponse.json(
        {
          error: "VPS 앱 제어 상태를 확인할 수 없어 시작을 차단했습니다.",
          code: "VPS_RUNTIME_UNREACHABLE",
        },
        { status: 503 },
      );
    }
    if (
      !hostStatus.expectedSourceRevision ||
      hostStatus.hosts.VPS.sourceRevision !== hostStatus.expectedSourceRevision
    ) {
      return NextResponse.json(
        {
          error: "VPS 코드 revision이 호스트 제어기에 승인된 exact SHA와 일치하지 않습니다.",
          code: "VPS_REVISION_MISMATCH",
        },
        { status: 409 },
      );
    }
    if (hostStatus.hosts.HOME.reachable && hostStatus.hosts.HOME.state !== "STOPPED") {
      return NextResponse.json(
        {
          error: "HOME 앱의 완전한 정지를 확인한 뒤 VPS 앱을 시작할 수 있습니다.",
          code: "HOME_NOT_STOPPED",
        },
        { status: 409 },
      );
    }
    if (!hostStatus.hosts.HOME.reachable && input.homeStoppedConfirmed !== true) {
      return NextResponse.json(
        {
          error: "HOME 상태를 확인할 수 없습니다. 기존 로컬 앱과 Tunnel 종료를 직접 확인해 주세요.",
          code: "HOME_STOP_UNCONFIRMED",
        },
        { status: 409 },
      );
    }
  }

  const result = await performVttRuntimeAction({
    action: input.action,
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
        action: input.action === "START" ? "Nochichim VTT 시작" : "Nochichim VTT 종료",
        actor: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
        summary: `${result.body.previousState} → ${result.body.status.state}`,
        target: "nochiijjim.com",
        details: [
          { name: "요청 ID", value: requestId },
          { name: "결과", value: result.body.result },
          {
            name: "소스 커밋",
            value: result.body.status.sourceRevision ?? "확인 불가",
          },
          {
            name: "접속자",
            value: result.body.status.connectedUsers === null
              ? "확인 불가"
              : `${result.body.status.connectedUsers}명`,
          },
          { name: "재확인 종료", value: input.force === true ? "예" : "아니오" },
          ...(input.action === "START"
            ? [{
                name: "HOME 수동 종료 확인",
                value: input.homeStoppedConfirmed === true ? "예" : "상태 helper 확인",
              }]
            : []),
        ],
        timestamp: new Date(),
      },
      { dedupeKey: `vtt-runtime:${requestId}` },
    );
  } catch (error) {
    auditRecorded = false;
    console.error(
      "[admin/vtt-runtime] audit enqueue failed",
      { requestId, error: error instanceof Error ? error.message : "unknown" },
    );
  }

  return NextResponse.json(
    {
      ...result.body,
      auditRecorded,
      ...(!auditRecorded
        ? { warning: "제어는 완료됐지만 감사 기록 적재에 실패했습니다." }
        : {}),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        ...(result.body.replayed ? { "X-Idempotency-Replayed": "true" } : {}),
      },
    },
  );
}
