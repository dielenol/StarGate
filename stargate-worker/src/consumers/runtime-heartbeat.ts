import { randomUUID } from "node:crypto";

import {
  getDb,
  type IntegrationOutboxKind,
} from "@stargate/shared-db";

import type { WorkerConsumerName, WorkerMode } from "../config.js";
import type { DueWorkConsumerPort } from "./port.js";

export interface WorkerRuntimeStatusDocument {
  _id: WorkerMode;
  instanceId: string;
  mode: WorkerMode;
  enabledConsumers: WorkerConsumerName[];
  enabledOutboxKinds: IntegrationOutboxKind[];
  ready: boolean;
  startedAt: Date;
  lastSeenAt: Date;
}

export class WorkerRuntimeHeartbeatConsumer implements DueWorkConsumerPort {
  readonly name = "worker-runtime-heartbeat";
  readonly #instanceId = randomUUID();
  readonly #startedAt = new Date();

  constructor(
    private readonly options: {
      mode: WorkerMode;
      enabledConsumers: WorkerConsumerName[];
      enabledOutboxKinds: IntegrationOutboxKind[];
      isReady: () => boolean;
    },
  ) {}

  async tick() {
    const db = await getDb();
    const now = new Date();
    await db.collection<WorkerRuntimeStatusDocument>("worker_runtime_status").updateOne(
      { _id: this.options.mode },
      {
        $set: {
          instanceId: this.#instanceId,
          mode: this.options.mode,
          enabledConsumers: [...this.options.enabledConsumers],
          enabledOutboxKinds: [...this.options.enabledOutboxKinds],
          ready: this.options.isReady(),
          startedAt: this.#startedAt,
          lastSeenAt: now,
        },
      },
      { upsert: true },
    );
    return { observedDue: 0 };
  }
}
