import assert from "node:assert/strict";
import test from "node:test";

import { resolveDiscordWebhookDestination } from "../dist/outbox/discord-routing.js";

test("workflow와 운영 경보는 다른 webhook으로 fallback하지 않는다", () => {
  assert.throws(
    () =>
      resolveDiscordWebhookDestination("WORKFLOW", {
        DISCORD_WEBHOOK_AUDIT_URL:
          "https://discord.com/api/webhooks/audit/token",
      }),
    /WORKFLOW Discord webhook 환경변수/,
  );
  assert.throws(
    () =>
      resolveDiscordWebhookDestination("OPERATIONS", {
        DISCORD_WEBHOOK_WORKFLOW_URL:
          "https://discord.com/api/webhooks/workflow/token",
        DISCORD_WEBHOOK_AUDIT_URL:
          "https://discord.com/api/webhooks/audit/token",
      }),
    /OPERATIONS Discord webhook 환경변수/,
  );
});

test("workflow와 운영 경보는 각 전용 webhook만 사용한다", () => {
  const workflow = "https://discord.com/api/webhooks/workflow/token";
  const operations = "https://discord.com/api/webhooks/ops/token";

  assert.equal(
    resolveDiscordWebhookDestination("WORKFLOW", {
      DISCORD_WEBHOOK_WORKFLOW_URL: workflow,
    }),
    workflow,
  );
  assert.equal(
    resolveDiscordWebhookDestination("OPERATIONS", {
      DISCORD_WEBHOOK_OPS_URL: operations,
    }),
    operations,
  );
});
