import { createDiscordIntegrationOutboxHandlers } from "./discord-handlers.js";
import type { IntegrationOutboxHandlerRegistry } from "./handler-registry.js";

/**
 * Discord REST/webhook delivery wiring 지점.
 * handler는 발송 직전에 ACTIVE 사용자/Discord 연결 상태를 재검증해야 한다.
 */
export function createDefaultIntegrationOutboxHandlers(): IntegrationOutboxHandlerRegistry {
  return createDiscordIntegrationOutboxHandlers();
}
