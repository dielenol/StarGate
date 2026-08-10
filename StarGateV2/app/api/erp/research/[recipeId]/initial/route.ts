import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import { beginInitialResearch } from "@/lib/db/research-lab";
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
  action: "INITIAL_STARTED";
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
  const { recipeId } = await context.params;

  try {
    const result = await executeEconomicOperationResult<StoredActionResult>({
      requestId,
      domain: "research-lab-initial",
      actorId: session.user.id,
      payload: { recipeId },
      run: async (mongoSession) => {
        await beginInitialResearch({
          recipeId,
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
          requestId,
          session: mongoSession,
        });
        return { status: 201, body: { ok: true, action: "INITIAL_STARTED" } };
      },
    });
    const dialogue = await buildResearchActionDialogue(
      session.user.id,
      "INITIAL_STARTED",
    ).catch(() => fallbackResearchActionDialogue("INITIAL_STARTED"));
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
    return researchLabErrorResponse(error, "최초 연구를 시작하지 못했습니다.");
  }
}
