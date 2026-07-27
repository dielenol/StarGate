import { getDb } from "@stargate/shared-db";

import type { DueWorkConsumerPort } from "../consumers/port.js";

export function createShadowOutboxConsumer(): DueWorkConsumerPort {
  return {
    name: "integration-outbox",
    async tick() {
      const db = await getDb();
      const now = new Date();
      const observedDue = await db
        .collection("integration_outbox")
        .countDocuments({
          $or: [
            { status: "PENDING", availableAt: { $lte: now } },
            { status: "PROCESSING", leaseUntil: { $lte: now } },
          ],
        });
      return { observedDue };
    },
  };
}
