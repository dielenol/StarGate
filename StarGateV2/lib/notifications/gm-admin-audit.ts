import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";
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

export async function findMissingGmAdminAuditDedupeKeys(
  dedupeKeys: string[],
): Promise<string[]> {
  const uniqueKeys = [...new Set(dedupeKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) return [];

  const storedToPublic = new Map<string, string>(
    uniqueKeys.map(key => [`gm_admin_audit:${key}`, key] as const),
  );
  const existing = await (await getDb())
    .collection("integration_outbox")
    .find(
      {
        kind: "GM_ADMIN_AUDIT",
        dedupeKey: { $in: [...storedToPublic.keys()] },
      },
      { projection: { _id: 0, dedupeKey: 1 } },
    )
    .toArray();
  const existingPublicKeys = new Set(
    existing
      .map(document => storedToPublic.get(String(document.dedupeKey)))
      .filter((key): key is string => Boolean(key)),
  );
  return uniqueKeys.filter(key => !existingPublicKeys.has(key));
}
