import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * 폴링 GET 응답의 조건부 재검증(ETag/304) 헬퍼.
 *
 * - 바이트/파싱 절감 전용 — 서버는 여전히 매 요청 페이로드를 계산해 해시한다
 *   (DB 비용 불변). DB 비용 절감은 폴링 케이던스(refetchInterval)가 담당한다.
 * - `Cache-Control: private, no-cache` — 브라우저가 매번 재검증하되 304 시
 *   캐시된 응답 본문을 재사용한다. (`no-store` 는 조건부 캐시 자체를 꺼서
 *   ETag 가 무의미해지므로 함께 쓰지 말 것)
 * - If-None-Match 비교는 약식 문자열 일치 (`W/` 프리픽스 + 콤마 리스트 허용).
 *   자체 발급한 strong ETag 만 오가는 폴링 경로 전용이다.
 * - `no-cache` 는 저장 금지가 아니므로 응답 본문이 브라우저 디스크 캐시에 잔존한다 —
 *   내부 ERP·개인 단말 전제로 수용한 트레이드오프. 공용 단말 도입 시 재검토할 것.
 */
export function jsonWithETag(
  request: Request,
  payload: object,
  init?: { headers?: Record<string, string> },
): NextResponse {
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const headers: Record<string, string> = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    ...init?.headers,
  };

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch !== null && matchesIfNoneMatch(ifNoneMatch, etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function matchesIfNoneMatch(ifNoneMatch: string, etag: string): boolean {
  return ifNoneMatch.split(",").some((candidate) => {
    const trimmed = candidate.trim();
    const bare = trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed;
    return bare === etag;
  });
}
