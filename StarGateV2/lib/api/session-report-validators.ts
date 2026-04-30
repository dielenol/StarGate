/**
 * 세션 리포트 API 입력 가드 (POST /api/erp/session-reports, PATCH /api/erp/session-reports/[id]).
 *
 * highlights / participants 배열에 대해 타입 + 항목 길이 cap 검증.
 * 핸들러는 결과의 error / value 분기로 분기.
 */

import { NextResponse } from "next/server";

export const HIGHLIGHT_ITEM_MAX = 500;
export const PARTICIPANT_ITEM_MAX = 200;
export const HIGHLIGHTS_MAX_COUNT = 50;
export const PARTICIPANTS_MAX_COUNT = 30;

export type SessionReportArrayCheck =
  | { error: NextResponse }
  | { value: { highlights?: string[]; participants?: string[] } };

export function validateSessionReportArrays(body: {
  highlights?: unknown;
  participants?: unknown;
}): SessionReportArrayCheck {
  const value: { highlights?: string[]; participants?: string[] } = {};

  if (body.highlights !== undefined) {
    if (
      !Array.isArray(body.highlights) ||
      body.highlights.length > HIGHLIGHTS_MAX_COUNT ||
      !body.highlights.every(
        (t) => typeof t === "string" && t.length <= HIGHLIGHT_ITEM_MAX,
      )
    ) {
      return badRequest("highlights 형식 오류");
    }
    value.highlights = body.highlights;
  }

  if (body.participants !== undefined) {
    if (
      !Array.isArray(body.participants) ||
      body.participants.length > PARTICIPANTS_MAX_COUNT ||
      !body.participants.every(
        (t) => typeof t === "string" && t.length <= PARTICIPANT_ITEM_MAX,
      )
    ) {
      return badRequest("participants 형식 오류");
    }
    value.participants = body.participants;
  }

  return { value };
}

function badRequest(message: string): { error: NextResponse } {
  return { error: NextResponse.json({ error: message }, { status: 400 }) };
}
