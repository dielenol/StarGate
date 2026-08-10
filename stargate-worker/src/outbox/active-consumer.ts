import type { DueWorkConsumerPort } from "../consumers/port.js";
import {
  IntegrationOutboxHandlerUnavailableError,
  type IntegrationOutboxHandlerRegistry,
} from "./handler-registry.js";
import type { IntegrationOutboxPort } from "./port.js";

export class SharedDbIntegrationOutboxConsumer
  implements DueWorkConsumerPort
{
  readonly name = "integration-outbox";

  constructor(
    private readonly persistence: IntegrationOutboxPort,
    private readonly handlers: IntegrationOutboxHandlerRegistry,
    private readonly maxBatchSize = 50,
  ) {}

  async tick({ signal }: { signal: AbortSignal }) {
    if (this.handlers.size === 0) {
      throw new Error(
        "active integration_outbox consumer에 delivery handler가 없습니다.",
      );
    }

    const summary = {
      observedDue: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
      dead: 0,
    };
    for (
      let index = 0;
      index < this.maxBatchSize && !signal.aborted;
      index += 1
    ) {
      const event = await this.persistence.claimDue(new Date());
      if (!event) break;
      summary.observedDue += 1;
      summary.claimed += 1;

      if (!event._id || !event.leaseToken) {
        throw new Error(
          "claim된 integration_outbox에 ID 또는 leaseToken이 없습니다.",
        );
      }
      const handler = this.handlers.get(event.kind);
      try {
        if (event.version !== 1) {
          throw new Error(
            `지원하지 않는 integration_outbox payload version입니다: ${event.version}`,
          );
        }
        if (!handler) {
          throw new IntegrationOutboxHandlerUnavailableError(event.kind);
        }
        const result = await handler.deliver(event);
        const completed = await this.persistence.complete({
          id: event._id,
          leaseToken: event.leaseToken,
          completedAt: new Date(),
          result,
        });
        if (!completed) {
          throw new Error(
            `integration_outbox 완료 전에 lease를 상실했습니다: ${event.dedupeKey}`,
          );
        }
        summary.delivered += 1;
      } catch (error) {
        const status = await this.persistence.fail({
          id: event._id,
          leaseToken: event.leaseToken,
          attempts: event.attempts,
          error,
          failedAt: new Date(),
        });
        summary.failed += 1;
        if (status === "DEAD") summary.dead += 1;
      }
    }
    return summary;
  }
}
