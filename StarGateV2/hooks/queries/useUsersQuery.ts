import { useQuery } from "@tanstack/react-query";

import type { UserPublic } from "@/types/user";

export const userKeys = {
  all: ["users"] as const,
};

async function fetchUsers(): Promise<UserPublic[]> {
  const res = await fetch("/api/erp/users");
  if (!res.ok) throw new Error("사용자 목록을 불러올 수 없습니다.");
  const data = await res.json();
  return data.users;
}

export function useUsers(options?: { initialData?: UserPublic[] }) {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
    initialData: options?.initialData,
  });
}
