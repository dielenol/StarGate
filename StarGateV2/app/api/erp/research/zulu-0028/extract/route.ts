import { NextResponse } from "next/server";

import type { ExtractZuluSampleResponse } from "@/lib/research/zulu-sample-lab";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import { extractZuluSample } from "@/lib/db/zulu-sample-lab";
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

  let mainCharacter;
  try {
    mainCharacter = await findMainCharacterByOwner(session.user.id);
  } catch {
    return NextResponse.json(
      {
        error: "MAIN AGENT 캐릭터 정합성을 확인할 수 없습니다.",
        code: "MAIN_CHARACTER_INTEGRITY",
      },
      { status: 409 },
    );
  }
  if (!mainCharacter?._id || mainCharacter.type !== "AGENT") {
    return NextResponse.json(
      {
        error: "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
        code: "NO_MAIN_CHARACTER",
      },
      { status: 409 },
    );
  }
  const expectedCharacter = {
    id: String(mainCharacter._id),
    codename: mainCharacter.codename,
  };

  try {
    const result =
      await executeEconomicOperationResult<ExtractZuluSampleResponse>({
        requestId,
        domain: "zulu-sample-extraction",
        actorId: session.user.id,
        payload: {
          lineId: ZULU_SAMPLE_LINE_ID,
          characterId: expectedCharacter.id,
        },
        run: async (mongoSession) => ({
          status: 201,
          body: await extractZuluSample({
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
            },
            expectedCharacter,
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
      "ZULU-0028 샘플을 추출하지 못했습니다.",
    );
  }
}
