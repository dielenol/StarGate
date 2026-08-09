import type { IntegrationOutboxKind } from "@stargate/shared-db";

export type DiscordWebhookDestination =
  | "AUDIT"
  | "WORKFLOW"
  | "SHOP"
  | "STOCK"
  | "OPERATIONS";

type WebhookIntegrationKind = Exclude<
  IntegrationOutboxKind,
  "PLAYER_TRADE_DM"
>;

export const DISCORD_OUTBOX_DESTINATIONS = {
  GM_ADMIN_AUDIT: "AUDIT",
  CHARACTER_EDIT_WEBHOOK: "AUDIT",
  EQUIPMENT_WORKSHOP_WEBHOOK: "WORKFLOW",
  SHOP_REORDER_REQUEST_WEBHOOK: "WORKFLOW",
  SHOP_REORDER_FULFILLED_WEBHOOK: "SHOP",
  SHOP_PRODUCT_LAUNCH_WEBHOOK: "SHOP",
  MRBEAST_LOTTERY_WINNER_WEBHOOK: "SHOP",
  STOCK_MANUAL_INTERVENTION_WEBHOOK: "STOCK",
  WORKFLOW_STATUS_WEBHOOK: "WORKFLOW",
} as const satisfies Record<WebhookIntegrationKind, DiscordWebhookDestination>;

const DESTINATION_ENV_NAMES: Record<
  DiscordWebhookDestination,
  readonly string[]
> = {
  AUDIT: ["DISCORD_WEBHOOK_AUDIT_URL"],
  WORKFLOW: [
    "DISCORD_WEBHOOK_WORKFLOW_URL",
    "DISCORD_WEBHOOK_AUDIT_URL",
  ],
  SHOP: ["DISCORD_WEBHOOK_SHOP_URL"],
  STOCK: ["DISCORD_WEBHOOK_STOCK_URL"],
  OPERATIONS: [
    "DISCORD_WEBHOOK_OPS_URL",
    "DISCORD_WEBHOOK_WORKFLOW_URL",
    "DISCORD_WEBHOOK_AUDIT_URL",
  ],
};

export class DiscordRouteConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordRouteConfigurationError";
  }
}

export function resolveDiscordWebhookDestination(
  destination: DiscordWebhookDestination,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const names = DESTINATION_ENV_NAMES[destination];
  const value = names
    .map((name) => env[name]?.trim())
    .find((candidate): candidate is string => Boolean(candidate));
  if (!value) {
    throw new DiscordRouteConfigurationError(
      `${destination} Discord webhook 환경변수가 필요합니다: ${names.join(", ")}`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DiscordRouteConfigurationError(
      `${destination} Discord webhook URL이 올바르지 않습니다.`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DiscordRouteConfigurationError(
      `${destination} Discord webhook URL protocol이 올바르지 않습니다.`,
    );
  }
  return value;
}

export function resolveIntegrationWebhookUrl(
  kind: WebhookIntegrationKind,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolveDiscordWebhookDestination(
    DISCORD_OUTBOX_DESTINATIONS[kind],
    env,
  );
}
