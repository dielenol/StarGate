import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  PlayerTradeOffer,
  PlayerTradeDto,
  TradeAction,
} from "@/types/trade";

import { creditsAdminKeys } from "@/hooks/queries/useCreditsAdminQuery";
import { creditKeys } from "@/hooks/queries/useCreditsQuery";
import { inventoryKeys } from "@/hooks/queries/useInventoryQuery";
import { notificationKeys } from "@/hooks/queries/useNotificationsQuery";
import { stocksKeys } from "@/hooks/queries/useStocksQuery";
import { tradeKeys } from "@/hooks/queries/useTradesQuery";
import { createIdempotencyKey } from "@/lib/query/idempotency";

interface TradeMutationResponse {
  trade: PlayerTradeDto;
  completed?: boolean;
}

interface CreateTradeVariables {
  kind: "GIFT" | "EXCHANGE";
  targetUserId: string;
  offer: PlayerTradeOffer;
}

interface UpdateTradeVariables {
  tradeId: string;
  action: TradeAction;
}

async function readTradeResponse(response: Response): Promise<TradeMutationResponse> {
  const body = (await response.json().catch(() => ({}))) as Partial<
    TradeMutationResponse
  > & { error?: string };
  if (!response.ok || !body.trade) {
    throw new Error(body.error ?? "거래 처리에 실패했습니다.");
  }
  return body as TradeMutationResponse;
}

function useInvalidateTradeAssets() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: tradeKeys.all,
        refetchType: "active",
      }),
      queryClient.invalidateQueries({ queryKey: creditsAdminKeys.all }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: creditKeys.all }),
      queryClient.invalidateQueries({ queryKey: stocksKeys.holdings }),
      queryClient.invalidateQueries({ queryKey: stocksKeys.adminHoldings }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    ]);
  };
}

export function useCreateTradeMutation() {
  const invalidate = useInvalidateTradeAssets();
  return useMutation({
    mutationFn: async (variables: CreateTradeVariables) => {
      const response = await fetch("/api/erp/trades", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(
            "player-trade-create",
            variables,
          ),
        },
        body: JSON.stringify(variables),
      });
      return readTradeResponse(response);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTradeMutation() {
  const invalidate = useInvalidateTradeAssets();
  return useMutation({
    mutationFn: async (variables: UpdateTradeVariables) => {
      const response = await fetch(
        `/api/erp/trades/${encodeURIComponent(variables.tradeId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(
              `player-trade-${variables.action.action.toLowerCase()}`,
              variables,
            ),
          },
          body: JSON.stringify(variables.action),
        },
      );
      return readTradeResponse(response);
    },
    onSuccess: invalidate,
  });
}
