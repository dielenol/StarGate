/**
 * 병기부 운영 중지(ARMORY_BUREAU_ENABLED 미설정) 중 API 가드.
 *
 * - 변경(구매·연구·의뢰·견적·시험 등)은 GM 포함 전원 거부한다.
 * - 조회는 GM 에게만 허용한다.
 *
 * 스위치 정의는 worker 와 공유하므로 `@stargate/core` 에 있다.
 */

import { NextResponse } from "next/server";

import {
  ARMORY_BUREAU_SUSPENDED_CODE,
  ARMORY_BUREAU_SUSPENDED_MESSAGE,
  isArmoryBureauSuspended,
} from "@stargate/core/domain/armory-bureau-suspension";

export { isArmoryBureauSuspended };

const SUSPENDED_HEADERS = { "Cache-Control": "private, no-store" } as const;

function suspendedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: ARMORY_BUREAU_SUSPENDED_MESSAGE,
      code: ARMORY_BUREAU_SUSPENDED_CODE,
    },
    { status: 503, headers: SUSPENDED_HEADERS },
  );
}

/** 병기부 변경 API 진입 가드 — 중지 중이면 역할과 무관하게 503 응답을 돌려준다. */
export function armoryBureauMutationBlockedResponse(): NextResponse | null {
  return isArmoryBureauSuspended() ? suspendedResponse() : null;
}

/** 병기부 조회 API 가드 — 중지 중에는 GM 만 통과한다. */
export function armoryBureauReadBlockedResponse(
  role: string | null | undefined,
): NextResponse | null {
  if (!isArmoryBureauSuspended()) return null;
  return role === "GM" ? null : suspendedResponse();
}
