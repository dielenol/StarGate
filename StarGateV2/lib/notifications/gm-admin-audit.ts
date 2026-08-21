import type { GmAdminAuditWebhookPayload } from "@/lib/outbox/contracts";
import type { ClientSession } from "mongodb";

import { enqueueGmAdminAudit } from "@/lib/outbox/integration";

/** 성공한 GM 관리 mutation의 Discord 감사를 durable outbox에 기록한다. */
export async function scheduleGmAdminAudit(
  payload: GmAdminAuditWebhookPayload,
  options: { session?: ClientSession; dedupeKey?: string } = {},
): Promise<void> {
  if (payload.actor.role !== "GM") return;
  await enqueueGmAdminAudit(payload, options);
}
