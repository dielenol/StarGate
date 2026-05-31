import { QueryClient } from "@tanstack/react-query";

const DEFAULT_STALE_TIME_MS = 15 * 60 * 1000;
const DEFAULT_GC_TIME_MS = 60 * 60 * 1000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
