import { useQuery } from "@tanstack/react-query";

import type { CreditTransaction } from "@/types/credit";

export const creditKeys = {
  all: ["credits"] as const,
};

async function fetchCredits(): Promise<{
  transactions: CreditTransaction[];
}> {
  const res = await fetch("/api/erp/credits");
  if (!res.ok) throw new Error("크레딧 데이터를 불러올 수 없습니다.");
  return res.json();
}

export function useCredits(options?: {
  initialData?: { transactions: CreditTransaction[] };
}) {
  return useQuery({
    queryKey: creditKeys.all,
    queryFn: fetchCredits,
    staleTime: 60 * 1000,
    initialData: options?.initialData,
  });
}
