import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  pageLockKeys,
  type PageLocksResponse,
} from "@/hooks/queries/usePageLocksQuery";

interface SetPageLockInput {
  lockKey: string;
  locked: boolean;
}

type SetPageLockResponse = SetPageLockInput;

async function setPageLock(
  input: SetPageLockInput,
): Promise<SetPageLockResponse> {
  const response = await fetch("/api/erp/page-locks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as
    | (SetPageLockResponse & { error?: string })
    | null;
  if (!response.ok || !data) {
    throw new Error(data?.error ?? "페이지 잠금 상태를 변경하지 못했습니다.");
  }
  return data;
}

export function useSetPageLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setPageLock,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: pageLockKeys.all });
      const previous = queryClient.getQueryData<PageLocksResponse>(
        pageLockKeys.all,
      );
      queryClient.setQueryData<PageLocksResponse>(pageLockKeys.all, (current) => ({
        overrides: {
          ...(current?.overrides ?? {}),
          [input.lockKey]: input.locked,
        },
      }));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(pageLockKeys.all, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pageLockKeys.all });
    },
  });
}
