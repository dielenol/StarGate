import { after } from "next/server";

import {
  notifyGmAdminAudit,
  type GmAdminAuditWebhookPayload,
} from "@/lib/discord";

/** 성공한 GM 관리 mutation의 Discord 감사를 응답 이후 실행한다. */
export function scheduleGmAdminAudit(
  payload: GmAdminAuditWebhookPayload,
): void {
  if (payload.actor.role !== "GM") return;
  after(() => notifyGmAdminAudit(payload));
}
