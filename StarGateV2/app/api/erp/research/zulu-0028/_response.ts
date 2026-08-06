import { NextResponse } from "next/server";

import { EconomicOperationConflictError } from "@/lib/db/execute-economic-operation";
import { ZuluSampleLabError } from "@/lib/research/zulu-sample-lab";

export function zuluSampleLabErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof EconomicOperationConflictError) {
    return NextResponse.json(
      {
        error:
          error.reason === "processing"
            ? "동일한 연구 요청이 처리 중입니다."
            : "동일 Idempotency-Key가 다른 연구 요청에 사용되었습니다.",
        code: "DUPLICATE_REQUEST",
      },
      { status: 409 },
    );
  }
  if (error instanceof ZuluSampleLabError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[research/zulu-0028] request failed", error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
