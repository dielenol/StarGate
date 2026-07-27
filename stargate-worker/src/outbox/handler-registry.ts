import type { IntegrationOutboxKind } from "@stargate/shared-db";

import type { IntegrationOutboxDeliveryHandler } from "./port.js";

export class IntegrationOutboxHandlerUnavailableError extends Error {
  constructor(kind: IntegrationOutboxKind) {
    super(`integration_outbox handler가 연결되지 않았습니다: ${kind}`);
    this.name = "IntegrationOutboxHandlerUnavailableError";
  }
}

export class IntegrationOutboxHandlerRegistry {
  readonly #handlers = new Map<
    IntegrationOutboxKind,
    IntegrationOutboxDeliveryHandler
  >();

  constructor(handlers: readonly IntegrationOutboxDeliveryHandler[] = []) {
    for (const handler of handlers) {
      if (this.#handlers.has(handler.kind)) {
        throw new Error(`outbox handler가 중복되었습니다: ${handler.kind}`);
      }
      this.#handlers.set(handler.kind, handler);
    }
  }

  get size(): number {
    return this.#handlers.size;
  }

  get kinds(): IntegrationOutboxKind[] {
    return [...this.#handlers.keys()];
  }

  get(
    kind: IntegrationOutboxKind,
  ): IntegrationOutboxDeliveryHandler | undefined {
    return this.#handlers.get(kind);
  }
}
