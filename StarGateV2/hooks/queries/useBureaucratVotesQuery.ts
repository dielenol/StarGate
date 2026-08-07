import { useQuery } from "@tanstack/react-query";

import type { BureaucratVotesResponse } from "@/lib/bureaucrat-votes/contracts";

export const bureaucratVoteKeys = {
  all: ["bureaucrat-votes"] as const,
};

export class BureaucratVoteApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BureaucratVoteApiError";
    this.status = status;
    this.code = code;
  }
}

async function fetchBureaucratVotes(): Promise<BureaucratVotesResponse> {
  const response = await fetch("/api/erp/admin/bureaucrat-votes", {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new BureaucratVoteApiError(
      body.error ?? "관료 표결 현황을 불러오지 못했습니다.",
      response.status,
      body.code,
    );
  }
  return response.json();
}

export function useBureaucratVotes(options?: {
  initialData?: BureaucratVotesResponse;
}) {
  return useQuery({
    queryKey: bureaucratVoteKeys.all,
    queryFn: fetchBureaucratVotes,
    initialData: options?.initialData,
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.votes.some((vote) => vote.status === "OPEN")
        ? 30_000
        : false,
    refetchIntervalInBackground: false,
  });
}
