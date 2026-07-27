import {
  claimIntegrationOutbox,
  completeIntegrationOutbox,
  failIntegrationOutbox,
  type IntegrationOutboxKind,
} from "@stargate/shared-db";

import type { IntegrationOutboxPort } from "../outbox/port.js";

export class SharedDbIntegrationOutboxAdapter
  implements IntegrationOutboxPort
{
  constructor(
    private readonly options: {
      leaseMs?: number;
      maxAttempts?: number;
      backoffBaseMs?: number;
      kinds?: IntegrationOutboxKind[];
    } = {},
  ) {}

  claimDue(now: Date) {
    return claimIntegrationOutbox({
      now,
      leaseMs: this.options.leaseMs,
      maxAttempts: this.options.maxAttempts,
      kinds: this.options.kinds,
    });
  }

  complete(input: {
    id: Parameters<typeof completeIntegrationOutbox>[0]["id"];
    leaseToken: string;
    completedAt: Date;
  }) {
    return completeIntegrationOutbox({
      id: input.id,
      leaseToken: input.leaseToken,
      now: input.completedAt,
    });
  }

  fail(input: {
    id: Parameters<typeof failIntegrationOutbox>[0]["id"];
    leaseToken: string;
    attempts: number;
    error: unknown;
    failedAt: Date;
  }) {
    return failIntegrationOutbox({
      id: input.id,
      leaseToken: input.leaseToken,
      attempts: input.attempts,
      error: input.error,
      now: input.failedAt,
      maxAttempts: this.options.maxAttempts,
      backoffBaseMs: this.options.backoffBaseMs,
    });
  }
}
