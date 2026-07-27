import { sweepExpiredWorkerLeases } from "@stargate/shared-db";

import type { DueWorkConsumerPort } from "./port.js";

export class WorkerLeaseSweeper implements DueWorkConsumerPort {
  readonly name = "worker-lease-sweeper";

  constructor(
    private readonly sweep: typeof sweepExpiredWorkerLeases =
      sweepExpiredWorkerLeases,
  ) {}

  async tick({ signal }: { signal: AbortSignal }) {
    if (signal.aborted) {
      return { observedDue: 0, dead: 0 };
    }

    const result = await this.sweep({ now: new Date() });
    const dead =
      result.scheduledJobRunsDead + result.integrationOutboxDead;
    return {
      observedDue: dead,
      dead,
    };
  }
}
