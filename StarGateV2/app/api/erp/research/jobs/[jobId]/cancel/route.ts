import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import { cancelResearchJob } from "@/lib/db/research-lab";
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
} from "../../../_response";

interface StoredActionResult {
  ok: true;
  action: "JOB_CANCELLED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();
  if (session.user.isGuest) return guestReadOnlyResponse();
  if (!(await isResearchLabMutationEnabled())) return researchLabNotActivatedResponse();
  const requestId = readIdempotencyKey(request);
  if (!requestId) return invalidIdempotencyKeyResponse();
  const { jobId } = await context.params;

  try {
    const result = await executeEconomicOperationResult<StoredActionResult>({
      requestId,
      domain: "research-lab-job-cancel",
      actorId: session.user.id,
      payload: { jobId },
      run: async (mongoSession) => {
        await cancelResearchJob({
          jobId,
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
          session: mongoSession,
        });
        return { status: 200, body: { ok: true, action: "JOB_CANCELLED" } };
      },
    });
    const dialogue = await buildResearchActionDialogue(
      session.user.id,
      "JOB_CANCELLED",
    ).catch(() => fallbackResearchActionDialogue("JOB_CANCELLED"));
    const body: ResearchActionResponse = {
      ...result.body,
      replayed: result.replayed,
      dialogue,
    };
    return NextResponse.json(body, {
      status: result.status,
      headers: result.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    return researchLabErrorResponse(error, "연구 요청을 취소하지 못했습니다.");
  }
}
