import { NextResponse } from "next/server";
import type { ClientSession } from "mongodb";

import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";

export async function executeEconomicOperation<T>(args: {
  requestId: string;
  domain: string;
  actorId: string;
  payload: unknown;
  run: (session: ClientSession) => Promise<{ status: number; body: T }>;
}): Promise<NextResponse> {
  try {
    const result = await executeEconomicOperationResult(args);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
