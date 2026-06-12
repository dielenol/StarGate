/**
 * API 에러 → 사용자 메시지 공통 변환.
 *
 * shop / equipment-shop / stocks 의 describeXxxError 3개가 공유하던 동일 패턴:
 * 1) 도메인 ApiError 이고 code 가 메시지 맵에 있으면 맵 메시지
 * 2) code 가 없거나 맵에 없으면 서버 message
 * 3) 일반 Error 면 message
 * 4) 그 외 fallback
 *
 * client/server 양쪽에서 사용 가능 — 런타임 의존성 없음.
 */
export function describeApiError<TCode extends string>(
  err: unknown,
  ApiError: new (...args: never[]) => Error & { code?: TCode },
  messages: Readonly<Partial<Record<TCode, string>>>,
  fallback = "알 수 없는 오류가 발생했습니다.",
): string {
  if (err instanceof ApiError) {
    if (err.code) return messages[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
