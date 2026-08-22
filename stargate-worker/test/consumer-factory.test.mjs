import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainConsumerConfigurationError,
  createDefaultDomainConsumers,
} from "../dist/consumers/factory.js";

test("domain consumer는 opt-in된 종류만 만들고 필요한 secret을 선검증한다", () => {
  const consumers = createDefaultDomainConsumers(
    ["ameri-dm", "research-ranking", "shop-restock", "stock-market-wire"],
    {
      AMERI_DISCORD_BOT_TOKEN: "test-ameri-token",
      DISCORD_WEBHOOK_RESEARCH_URL:
        "https://discord.com/api/webhooks/research/token",
      DISCORD_WEBHOOK_SHOP_URL:
        "https://discord.com/api/webhooks/shop/token",
      DISCORD_WEBHOOK_STOCK_URL:
        "https://discord.com/api/webhooks/stock/token",
    },
  );
  assert.deepEqual(
    consumers.map((consumer) => consumer.name),
    ["ameri-dm", "research-ranking", "shop-restock", "stock-market-wire"],
  );

  assert.throws(
    () => createDefaultDomainConsumers(["research-card"], {}),
    DomainConsumerConfigurationError,
  );
});

test("research-lab consumer는 별도 운영 flag 전에는 mutation gate로 유지한다", async () => {
  const [gated] = createDefaultDomainConsumers(["research-lab"], {});
  assert.equal(gated.name, "research-lab");
  assert.equal(gated.constructor.name, "ResearchLabActivationGateConsumer");
  assert.deepEqual(await gated.tick(), { observedDue: 0 });

  const [active] = createDefaultDomainConsumers(["research-lab"], {
    RESEARCH_LAB_WORKER_ENABLED: "true",
  });
  assert.equal(active.name, "research-lab");
  assert.equal(active.constructor.name, "ResearchLabConsumer");
});
