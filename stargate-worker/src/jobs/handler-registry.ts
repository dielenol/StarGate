import type { ScheduledJobName } from "@stargate/core";

import type { ScheduledJobHandler } from "./port.js";

export class ScheduledJobHandlerUnavailableError extends Error {
  constructor(jobName: ScheduledJobName) {
    super(`예약 작업 handler가 연결되지 않았습니다: ${jobName}`);
    this.name = "ScheduledJobHandlerUnavailableError";
  }
}

export class ScheduledJobHandlerRegistry {
  readonly #handlers = new Map<ScheduledJobName, ScheduledJobHandler>();

  constructor(handlers: readonly ScheduledJobHandler[] = []) {
    for (const handler of handlers) {
      if (this.#handlers.has(handler.jobName)) {
        throw new Error(`예약 작업 handler가 중복되었습니다: ${handler.jobName}`);
      }
      this.#handlers.set(handler.jobName, handler);
    }
  }

  has(jobName: ScheduledJobName): boolean {
    return this.#handlers.has(jobName);
  }

  require(jobName: ScheduledJobName): ScheduledJobHandler {
    const handler = this.#handlers.get(jobName);
    if (!handler) throw new ScheduledJobHandlerUnavailableError(jobName);
    return handler;
  }
}
