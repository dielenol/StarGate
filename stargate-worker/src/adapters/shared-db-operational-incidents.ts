import {
  findWorkerOperationalIncident,
  recordWorkerOperationalIncident,
  resolveWorkerOperationalIncident,
} from "@stargate/shared-db";

import type {
  OperationalIncidentState,
  OperationalIncidentStore,
} from "../outbox/operational-alerts.js";

export class SharedDbOperationalIncidentStore
  implements OperationalIncidentStore
{
  async find(consumer: string): Promise<OperationalIncidentState | null> {
    const incident = await findWorkerOperationalIncident(consumer);
    return incident
      ? {
          fingerprint: incident.fingerprint,
          severity: incident.severity,
          openedAt: incident.openedAt,
          lastSentAt: incident.lastSentAt,
        }
      : null;
  }

  async record(input: {
    consumer: string;
    fingerprint: string;
    severity: "WARNING" | "CRITICAL";
    sentAt: Date;
  }): Promise<void> {
    await recordWorkerOperationalIncident(input);
  }

  resolve(input: { consumer: string; fingerprint: string }): Promise<boolean> {
    return resolveWorkerOperationalIncident(input);
  }
}
