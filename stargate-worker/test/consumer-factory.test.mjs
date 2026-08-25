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

test("honor-analysis는 gate OFF에서 secret 없이 no-op이고 ON에서 dual analyzer를 구성한다", async () => {
  const [gated] = createDefaultDomainConsumers(["honor-analysis"], {});
  assert.equal(gated.constructor.name, "HonorAnalysisActivationGateConsumer");
  assert.deepEqual(await gated.tick(), { observedDue: 0 });

  const [active] = createDefaultDomainConsumers(["honor-analysis"], {
    HALL_OF_FAME_V2_WRITES_ENABLED: "true",
    OLLAMA_API_KEY: "test-key",
  });
  assert.equal(active.constructor.name, "HonorAnalysisConsumer");
  assert.throws(
    () =>
      createDefaultDomainConsumers(["honor-analysis"], {
        HALL_OF_FAME_V2_WRITES_ENABLED: "true",
      }),
    DomainConsumerConfigurationError,
  );
  assert.throws(
    () =>
      createDefaultDomainConsumers(["honor-analysis"], {
        HALL_OF_FAME_V2_WRITES_ENABLED: "true",
        OLLAMA_API_KEY: "test-key",
        HALL_OF_FAME_PROPOSER_MODEL: "same",
        HALL_OF_FAME_CRITIC_MODEL: "same",
      }),
    /MODELS_MUST_DIFFER/,
  );
});
