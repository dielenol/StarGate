import { useMutation, useQueryClient } from "@tanstack/react-query";

import { throwMutationError } from "@/hooks/mutations/StaleVersionApiError";
import { galleryKeys } from "@/hooks/queries/useGalleryQuery";
import type { GalleryFanartMetadataInput } from "@/types/gallery";

interface GalleryItemMutationResponse {
  success: true;
  id: string;
  replayed?: boolean;
  updatedAt?: string;
}

export interface GalleryUploadMutationInput {
  file: File;
  metadata: GalleryFanartMetadataInput;
  requestId: string;
}

export function useUploadGalleryFanart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GalleryUploadMutationInput) => {
      const formData = new FormData();
      formData.set("file", input.file);
      formData.set("metadata", JSON.stringify(input.metadata));
      const response = await fetch("/api/erp/gallery/fanart", {
        method: "POST",
        headers: { "Idempotency-Key": input.requestId },
        body: formData,
      });
      if (!response.ok) {
        await throwMutationError(response, "팬아트 등록에 실패했습니다.");
      }
      return response.json() as Promise<GalleryItemMutationResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.all });
    },
  });
}

export function useUpdateGalleryFanart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      metadata: GalleryFanartMetadataInput;
      expectedUpdatedAt: string;
    }) => {
      const response = await fetch(
        `/api/erp/gallery/fanart/${encodeURIComponent(input.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "metadata",
            ...input.metadata,
            expectedUpdatedAt: input.expectedUpdatedAt,
          }),
        },
      );
      if (!response.ok) {
        await throwMutationError(response, "팬아트 정보 수정에 실패했습니다.");
      }
      return response.json() as Promise<GalleryItemMutationResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.all });
    },
  });
}

export function useModerateGalleryFanart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      expectedUpdatedAt: string;
      status: "PUBLISHED" | "HIDDEN";
      reason: string;
    }) => {
      const response = await fetch(
        `/api/erp/gallery/fanart/${encodeURIComponent(input.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "moderation", ...input }),
        },
      );
      if (!response.ok) {
        await throwMutationError(response, "팬아트 공개 상태 변경에 실패했습니다.");
      }
      return response.json() as Promise<GalleryItemMutationResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.all });
    },
  });
}

export function useDeleteGalleryFanart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; expectedUpdatedAt: string }) => {
      const response = await fetch(
        `/api/erp/gallery/fanart/${encodeURIComponent(input.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedUpdatedAt: input.expectedUpdatedAt }),
        },
      );
      if (!response.ok) {
        await throwMutationError(response, "팬아트 삭제에 실패했습니다.");
      }
      return response.json() as Promise<{
        success: true;
        blobCleanupPending: boolean;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: galleryKeys.all });
    },
  });
}
