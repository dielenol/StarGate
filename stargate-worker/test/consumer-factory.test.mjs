import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainConsumerConfigurationError,
  createDefaultDomainConsumers,
} from "../dist/consumers/factory.js";

test("domain consumer는 opt-in된 종류만 만들고 필요한 secret을 선검증한다", () => {
  const consumers = createDefaultDomainConsumers(
    ["ameri-dm", "shop-restock", "stock-market-wire"],
    {
      AMERI_DISCORD_BOT_TOKEN: "test-ameri-token",
      DISCORD_WEBHOOK_SHOP_URL:
        "https://discord.com/api/webhooks/shop/token",
      DISCORD_WEBHOOK_STOCK_URL:
        "https://discord.com/api/webhooks/stock/token",
    },
  );
  assert.deepEqual(
    consumers.map((consumer) => consumer.name),
    ["ameri-dm", "shop-restock", "stock-market-wire"],
  );

  assert.throws(
    () => createDefaultDomainConsumers(["research-card"], {}),
    DomainConsumerConfigurationError,
  );
});
