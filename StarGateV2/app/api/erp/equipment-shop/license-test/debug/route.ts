import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  getTowaskiLicenseTestProgram,
  parseTowaskiLicenseTestRequest,
  type TowaskiLicenseV3ResolveRequest,
} from "@/lib/equipment-shop/license-test";
import {
  resolveTowaskiDebugLicenseTestV3,
  startTowaskiDebugLicenseTestV3,
  type TowaskiDebugLicenseV3Session,
} from "@/lib/equipment-shop/license-test-v3-debug";
import { isTowaskiLicenseSlug } from "@/lib/equipment-shop/licenses";

interface DebugLicenseTestBody {
  request?: unknown;
  session?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDebugSession(value: unknown): value is TowaskiDebugLicenseV3Session {
  if (
    !isRecord(value) ||
    typeof value.challengeId !== "string" ||
    value.challengeId.length > 128 ||
    typeof value.licenseSlug !== "string" ||
    !isTowaskiLicenseSlug(value.licenseSlug) ||
    typeof value.difficulty !== "string" ||
    !["basic", "standard", "expert"].includes(value.difficulty) ||
    typeof value.stepStartedAtMs !== "number" ||
    !Number.isFinite(value.stepStartedAtMs) ||
    !isRecord(value.state)
  ) {
    return false;
  }
  const state = value.state;
  if (
    state.programVersion !== 3 ||
    !isRecord(state.progress) ||
    typeof state.progress.step !== "number" ||
    !Number.isInteger(state.progress.step) ||
    !Array.isArray(state.scenarios) ||
    state.scenarios.length < 1 ||
    state.scenarios.length > 12
  ) {
    return false;
  }
  const program = getTowaskiLicenseTestProgram(value.licenseSlug);
  return (
    value.difficulty === program.difficulty &&
    state.mode === program.mode &&
    state.progress.mode === program.mode &&
    state.progress.step >= 0 &&
    state.progress.step <= state.scenarios.length
  );
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return noStoreJson({ error: "Unauthorized" }, 401);
  }
  if (!hasRole(session.user.role, "GM")) {
    return noStoreJson({ error: "GM 디버그 권한이 필요합니다." }, 403);
  }

  const body = (await request.json().catch(() => null)) as
    | DebugLicenseTestBody
    | null;
  const testRequest = parseTowaskiLicenseTestRequest(body?.request);
  if (!testRequest) {
    return noStoreJson({ error: "디버그 시험 입력이 올바르지 않습니다." }, 400);
  }

  try {
    const result =
      testRequest.action === "start"
        ? startTowaskiDebugLicenseTestV3(testRequest.licenseSlug)
        : "step" in testRequest &&
            "elapsedMs" in testRequest.input &&
            isDebugSession(body?.session)
          ? resolveTowaskiDebugLicenseTestV3(
              body.session,
              testRequest as TowaskiLicenseV3ResolveRequest,
            )
          : null;
    if (!result) {
      return noStoreJson(
        { error: "V3 디버그 시험 세션이 올바르지 않습니다." },
        400,
      );
    }
    return noStoreJson(result);
  } catch {
    return noStoreJson(
      { error: "V3 디버그 시험 단계를 판정할 수 없습니다." },
      409,
    );
  }
}
