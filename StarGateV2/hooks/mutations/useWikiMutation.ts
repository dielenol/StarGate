import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { UpdateWikiPageInput } from "@/types/wiki";

import { wikiKeys } from "@/hooks/queries/useWikiQuery";
import { throwMutationError } from "./StaleVersionApiError";

interface CreateWikiBody {
  slug?: string;
  title: string;
  category?: string;
  tags?: string[];
  content: string;
  isPublic?: boolean;
}

export function useCreateWiki() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWikiBody) => {
      const res = await fetch("/api/erp/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "위키 페이지 생성에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}

export function useUpdateWiki() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      expectedUpdatedAt,
      id,
      data,
    }: {
      expectedUpdatedAt: string | null;
      id: string;
      data: UpdateWikiPageInput;
    }) => {
      const res = await fetch(`/api/erp/wiki/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, expectedUpdatedAt }),
      });
      if (!res.ok) {
        await throwMutationError(res, "위키 페이지 수정에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
      queryClient.invalidateQueries({
        queryKey: wikiKeys.byId(variables.id),
      });
    },
  });
}

export function useDeleteWiki() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) => {
      const res = await fetch(`/api/erp/wiki/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt }),
      });
      if (!res.ok) {
        await throwMutationError(res, "위키 페이지 삭제에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wikiKeys.all });
    },
  });
}
