import { useQuery } from "@tanstack/react-query";

import { useRealtimeRefetchInterval } from "@/lib/realtime/client-context";
import type { GalleryFeedResponse } from "@/types/gallery";

export const galleryKeys = {
  all: ["gallery"] as const,
};

const GALLERY_STALE_TIME_MS = 30 * 1000;
const GALLERY_REFETCH_INTERVAL_MS = 60 * 1000;

async function fetchGallery(): Promise<GalleryFeedResponse> {
  const response = await fetch("/api/erp/gallery", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "갤러리를 불러올 수 없습니다.");
  }
  return response.json() as Promise<GalleryFeedResponse>;
}

export function useGallery(options?: {
  enabled?: boolean;
  initialData?: GalleryFeedResponse;
  initialDataUpdatedAt?: number;
}) {
  const refetchInterval = useRealtimeRefetchInterval(
    GALLERY_REFETCH_INTERVAL_MS,
  );

  return useQuery({
    queryKey: galleryKeys.all,
    queryFn: fetchGallery,
    enabled: options?.enabled ?? true,
    staleTime: GALLERY_STALE_TIME_MS,
    refetchInterval,
    refetchIntervalInBackground: false,
    initialData: options?.initialData,
    initialDataUpdatedAt: options?.initialDataUpdatedAt,
  });
}
