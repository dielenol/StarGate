import { NextResponse } from "next/server";

import type { UnlockZuluSampleLineResponse } from "@/lib/research/zulu-sample-lab";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import { unlockZuluSampleLine } from "@/lib/db/zulu-sample-lab";
import { ZULU_SAMPLE_LINE_ID } from "@/lib/research/zulu-sample-lab";

import { zuluSampleLabErrorResponse } from "../_response";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json(
      { error: "GM만 최초 격리 개체를 제출할 수 있습니다.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  try {
    const result =
      await executeEconomicOperationResult<UnlockZuluSampleLineResponse>({
        requestId,
        domain: "zulu-sample-line-unlock",
        actorId: session.user.id,
        payload: { lineId: ZULU_SAMPLE_LINE_ID },
        run: async (mongoSession) => ({
          status: 201,
          body: await unlockZuluSampleLine({
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
            },
            requestId,
            session: mongoSession,
          }),
        }),
      });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    return zuluSampleLabErrorResponse(
      error,
      "ZULU-0028 샘플 라인을 개방하지 못했습니다.",
    );
  }
}
