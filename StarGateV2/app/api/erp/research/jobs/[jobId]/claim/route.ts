import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import {
  claimResearchJob,
  prepareResearchJobClaimInventoryLock,
} from "@/lib/db/research-lab";
import type { ResearchActionResponse } from "@/types/research";

import {
  buildResearchActionDialogue,
  fallbackResearchActionDialogue,
  guestReadOnlyResponse,
  invalidIdempotencyKeyResponse,
  researchLabErrorResponse,
  requireResearchLabMutationConfigured,
  unauthorizedResearchResponse,
} from "../../../_response";

interface StoredActionResult {
  ok: true;
  action: "JOB_CLAIMED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();
  if (session.user.isGuest) return guestReadOnlyResponse();
  const requestId = readIdempotencyKey(request);
  if (!requestId) return invalidIdempotencyKeyResponse();
  const { jobId } = await context.params;

  try {
    const result = await executeEconomicOperationResult<StoredActionResult>({
      requestId,
      domain: "research-lab-job-claim",
      actorId: session.user.id,
      payload: { jobId },
      prepare: async () => {
        requireResearchLabMutationConfigured();
        await prepareResearchJobClaimInventoryLock({
          jobId,
          requesterUserId: session.user.id,
        });
      },
      run: async (mongoSession) => {
        await claimResearchJob({
          jobId,
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
          session: mongoSession,
        });
        return { status: 200, body: { ok: true, action: "JOB_CLAIMED" } };
      },
    });
    const dialogue = await buildResearchActionDialogue(
      session.user.id,
      "JOB_CLAIMED",
    ).catch(() => fallbackResearchActionDialogue("JOB_CLAIMED"));
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
    return researchLabErrorResponse(error, "개인 연구 산출물을 수령하지 못했습니다.");
  }
}
