import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { UserRole } from "@/types/user";

import { userKeys } from "@/hooks/queries/useUsersQuery";

interface CreateUserInput {
  username: string;
  displayName: string;
  role: UserRole;
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await fetch("/api/erp/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "사용자 생성에 실패했습니다.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
