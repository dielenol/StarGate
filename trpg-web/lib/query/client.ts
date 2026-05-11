import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query 기본 설정.
 *
 * - `staleTime` 1분: 캘린더는 자주 변하지 않으므로 cache hit 우선
 * - `gcTime` 5분: 월 이동 후 복귀 시에도 캐시 보존
 * - `refetchOnWindowFocus` false: 모달 닫기 직후 불필요한 리페치 방지
 * - `retry` 1: 일시적 네트워크 오류만 한 번 재시도
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
