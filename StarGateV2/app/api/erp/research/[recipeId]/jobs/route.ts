import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import { enqueueResearchJob } from "@/lib/db/research-lab";
import type { ResearchActionResponse } from "@/types/research";

import {
  buildResearchActionDialogue,
  fallbackResearchActionDialogue,
  guestReadOnlyResponse,
  invalidIdempotencyKeyResponse,
  isResearchLabMutationEnabled,
  researchLabNotActivatedResponse,
  researchLabErrorResponse,
  unauthorizedResearchResponse,
} from "../../_response";

interface StoredActionResult {
  ok: true;
  action: "JOB_QUEUED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ recipeId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();
  if (session.user.isGuest) return guestReadOnlyResponse();
  if (!(await isResearchLabMutationEnabled())) return researchLabNotActivatedResponse();
  const requestId = readIdempotencyKey(request);
  if (!requestId) return invalidIdempotencyKeyResponse();
  const body = (await request.json().catch(() => null)) as {
    destination?: unknown;
  } | null;
  if (body?.destination !== "SHARED" && body?.destination !== "CHARACTER") {
    return NextResponse.json(
      { error: "수령처는 SHARED 또는 CHARACTER여야 합니다.", code: "INVALID_DESTINATION" },
      { status: 400 },
    );
  }
  const destination = body.destination;
  const { recipeId } = await context.params;

  try {
    const result = await executeEconomicOperationResult<StoredActionResult>({
      requestId,
      domain: "research-lab-job",
      actorId: session.user.id,
      payload: { recipeId, destination },
      run: async (mongoSession) => {
        await enqueueResearchJob({
          recipeId,
          destination,
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
          requestId,
          session: mongoSession,
        });
        return { status: 201, body: { ok: true, action: "JOB_QUEUED" } };
      },
    });
    const dialogue = await buildResearchActionDialogue(
      session.user.id,
      "JOB_QUEUED",
    ).catch(() => fallbackResearchActionDialogue("JOB_QUEUED"));
    const responseBody: ResearchActionResponse = {
      ...result.body,
      replayed: result.replayed,
      dialogue,
    };
    return NextResponse.json(responseBody, {
      status: result.status,
      headers: result.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    return researchLabErrorResponse(error, "반복생산 요청을 등록하지 못했습니다.");
  }
}
