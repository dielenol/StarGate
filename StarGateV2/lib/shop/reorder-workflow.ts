import "server-only";

import type { ClientSession } from "mongodb";

import { enqueueWorkflowStatusWebhook } from "@/lib/outbox/integration";
import type { ShopReorderRequestDoc } from "@/lib/shop/reorder-requests";

export async function enqueueShopReorderRequestedWorkflow(
  request: ShopReorderRequestDoc,
  options: { session?: ClientSession } = {},
): Promise<void> {
  await enqueueWorkflowStatusWebhook(
    {
      workflow: "SHOP_REORDER",
      workflowId: request._id,
      stage: "REQUESTED",
      revision: 1,
      actor: { kind: "PLAYER", displayName: request.userName },
      summary: "품절 상품의 추가 발주 요청이 접수되었습니다.",
      target: request.itemName,
      urlPath: "/erp/shop",
      occurredAt: request.createdAt,
    },
    `workflow:shop-reorder:${request._id}:REQUESTED:1`,
    options,
  );
}
