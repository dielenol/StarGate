import { createDiscordIntegrationOutboxHandlers } from "./discord-handlers.js";
import { IntegrationOutboxHandlerRegistry } from "./handler-registry.js";
import { createStockMarketRecoveryOutboxHandler } from "./stock-market-recovery-handler.js";

/**
 * Discord REST/webhook delivery wiring 지점.
 * handler는 발송 직전에 ACTIVE 사용자/Discord 연결 상태를 재검증해야 한다.
 */
export function createDefaultIntegrationOutboxHandlers(): IntegrationOutboxHandlerRegistry {
  const discord = createDiscordIntegrationOutboxHandlers();
  return new IntegrationOutboxHandlerRegistry([
    ...discord.kinds.map((kind) => discord.get(kind)!),
    createStockMarketRecoveryOutboxHandler(),
  ]);
}
