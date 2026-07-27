import { createHash } from "node:crypto";

import {
  INTEGRATION_OUTBOX_KINDS,
  JTEST_DISCORD_DM_MIRROR_RULE,
  resolveDiscordDmRecipients,
  type DiscordDmRecipientKind,
  type IntegrationOutboxEvent,
  type IntegrationOutboxKind,
} from "@stargate/shared-db";
import { findStockByTicker } from "@stargate/core/domain/stock-catalog";

import {
  DiscordDeliveryError,
  sendDiscordDirectMessage,
  sendDiscordWebhook,
  type DiscordWebhookPayload,
} from "./discord-client.js";
import { IntegrationOutboxHandlerRegistry } from "./handler-registry.js";
import type { IntegrationOutboxDeliveryHandler } from "./port.js";

const FIELD_VALUE_MAX = 1_000;
const FIELD_NAME_MAX = 256;
const SHOP_URL = "https://www.ordonet.co.kr/erp/shop";

type Environment = NodeJS.ProcessEnv;

interface DiscordHandlerDependencies {
  fetchImpl?: typeof fetch;
  resolveRecipients?: typeof resolveDiscordDmRecipients;
}

export class IntegrationOutboxConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationOutboxConfigurationError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} payload가 객체가 아닙니다.`);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
  max = FIELD_VALUE_MAX,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} 값이 없습니다.`);
  }
  return sanitize(value).slice(0, max);
}

function optionalText(value: unknown, max = FIELD_VALUE_MAX): string | null {
  return typeof value === "string" && value.trim()
    ? sanitize(value).slice(0, max)
    : null;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} 숫자 값이 없습니다.`);
  }
  return value;
}

function sanitize(value: string): string {
  return value
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "(비어 있음)";
  if (typeof value === "string") return sanitize(value || "(빈 문자열)");
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return sanitize(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function isoTimestamp(value: unknown): string {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error("Discord payload timestamp가 올바르지 않습니다.");
  }
  return date.toISOString();
}

function siteBaseUrl(env: Environment): string {
  const candidate =
    env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.ordonet.co.kr";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "https://www.ordonet.co.kr";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "https://www.ordonet.co.kr";
  }
}

function commonWebhookUrl(env: Environment): string | undefined {
  return (
    env.DISCORD_WEBHOOK_CHAR_EDIT_URL?.trim() ||
    env.DISCORD_WEBHOOK_URL?.trim()
  );
}

function selfEditWebhookUrl(env: Environment): string | undefined {
  return (
    env.DISCORD_WEBHOOK_CHAR_EDIT_URL?.trim() ||
    env.DISCORD_WEBHOOK_CHAR_SELF_EDIT_URL?.trim() ||
    env.DISCORD_WEBHOOK_CHARACTER_SELF_EDIT_URL?.trim() ||
    env.DISCORD_WEBHOOK_URL?.trim()
  );
}

function webhookUrlFor(
  kind: IntegrationOutboxKind,
  env: Environment,
): string {
  const value =
    kind === "STOCK_MANUAL_INTERVENTION_WEBHOOK"
      ? env.DISCORD_WEBHOOK_STOCK_URL?.trim() ||
        env.DISCORD_STOCK_WEBHOOK_URL?.trim()
      : kind === "SHOP_REORDER_FULFILLED_WEBHOOK"
      ? env.DISCORD_WEBHOOK_SHOP_URL?.trim()
      : kind === "SHOP_REORDER_REQUEST_WEBHOOK" ||
          kind === "EQUIPMENT_WORKSHOP_WEBHOOK"
        ? selfEditWebhookUrl(env)
        : commonWebhookUrl(env);
  if (!value) {
    throw new IntegrationOutboxConfigurationError(
      `${kind} Discord webhook 환경변수가 설정되지 않았습니다.`,
    );
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IntegrationOutboxConfigurationError(
      `${kind} Discord webhook URL protocol이 올바르지 않습니다.`,
    );
  }
  return value;
}

function basePayload(
  username: string,
  title: string,
  timestamp: string,
  options: {
    description?: string;
    url?: string;
    color?: number;
    fields?: DiscordWebhookPayload["embeds"][number]["fields"];
    avatarUrl?: string;
    footer?: string;
  } = {},
): DiscordWebhookPayload {
  return {
    username,
    ...(options.avatarUrl ? { avatar_url: options.avatarUrl } : {}),
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: title.slice(0, FIELD_NAME_MAX),
        ...(options.description
          ? { description: options.description.slice(0, 4_000) }
          : {}),
        ...(options.url ? { url: options.url } : {}),
        color: options.color ?? 0xc5a059,
        fields: options.fields ?? [],
        ...(options.footer ? { footer: { text: options.footer } } : {}),
        timestamp,
      },
    ],
  };
}

function buildGmAudit(
  payload: Record<string, unknown>,
): DiscordWebhookPayload {
  const actor = record(payload.actor, "actor");
  if (actor.role !== "GM") {
    throw new Error("GM_ADMIN_AUDIT actor role이 GM이 아닙니다.");
  }
  const timestamp = isoTimestamp(payload.timestamp);
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    { name: "작업 요약", value: text(payload.summary, "summary") },
  ];
  const target = optionalText(payload.target);
  if (target) fields.push({ name: "대상", value: target });
  if (Array.isArray(payload.details)) {
    for (const item of payload.details.slice(0, 8)) {
      const detail = record(item, "details");
      fields.push({
        name: text(detail.name, "details.name", FIELD_NAME_MAX),
        value: text(detail.value, "details.value"),
        ...(typeof detail.inline === "boolean"
          ? { inline: detail.inline }
          : {}),
      });
    }
  }
  return basePayload(
    "StarGate Admin Watch",
    `GM 관리 작업: ${text(payload.action, "action", FIELD_NAME_MAX)}`,
    timestamp,
    {
      description: `${text(actor.displayName, "actor.displayName")} · GM`,
      fields,
      footer: `actor ${text(actor.id, "actor.id", 200)}`,
    },
  );
}

function buildCharacterEdit(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const character = record(payload.character, "character");
  const actor = record(payload.actor, "actor");
  const timestamp = isoTimestamp(payload.timestamp);
  const playerEdit = payload.source === "player";
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    {
      name: "경고",
      value: playerEdit
        ? "유저 자가편집입니다. GM 확인 전까지 변경 내용을 검토해 주세요."
        : "GM/운영진 직접 수정입니다. 변경 내용은 즉시 반영되었고 감사 로그에 기록됩니다.",
    },
  ];
  if (!Array.isArray(payload.changes)) {
    throw new Error("character edit changes가 배열이 아닙니다.");
  }
  for (const item of payload.changes.slice(0, 10)) {
    const change = record(item, "changes");
    fields.push({
      name: text(change.field, "changes.field", FIELD_NAME_MAX),
      value: `${displayValue(change.before)}\n→\n${displayValue(change.after)}`.slice(
        0,
        FIELD_VALUE_MAX,
      ),
    });
  }
  const reason = optionalText(payload.reason);
  if (reason) fields.push({ name: "변경 사유", value: reason });
  const characterId = text(character.id, "character.id", 200);
  return basePayload(
    playerEdit ? "StarGate Character Watch" : "StarGate Audit Bot",
    `캐릭터 ${playerEdit ? "유저 자가편집" : "GM 직접 수정"}: ${text(character.name, "character.name", 100)} (${text(character.codename, "character.codename", 100)})`,
    timestamp,
    {
      url: `${siteBaseUrl(env)}/erp/characters/${encodeURIComponent(characterId)}`,
      description: `${text(actor.displayName, "actor.displayName")} · ${text(actor.role, "actor.role", 20)}`,
      color: playerEdit ? 0x5ea3c5 : 0xc5a059,
      fields,
    },
  );
}

function buildWorkshop(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const character = record(payload.character, "character");
  const requester = record(payload.requester, "requester");
  const kind = text(payload.kind, "kind", 20);
  const labels: Record<string, string> = {
    upgrade: "장착 장비 강화 문의",
    reload: "장비 액션 재장전 결재 요청",
    custom: "커스텀 장비 제작 의뢰",
  };
  if (!labels[kind]) throw new Error(`지원하지 않는 공방 kind입니다: ${kind}`);
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    {
      name: "신청자",
      value: `${text(requester.displayName, "requester.displayName")} · ${text(character.codename, "character.codename")}`,
    },
  ];
  const equipmentName = optionalText(payload.equipmentName);
  if (equipmentName) fields.push({ name: "대상 장비", value: equipmentName });
  fields.push({
    name: "요청 내용",
    value: text(payload.details, "details"),
  });
  const characterId = text(character.id, "character.id", 200);
  return basePayload(
    "StarGate Workshop Intake",
    `공방 ${labels[kind]}: ${text(character.codename, "character.codename", 100)}`,
    isoTimestamp(payload.timestamp),
    {
      url: `${siteBaseUrl(env)}/erp/characters/${encodeURIComponent(characterId)}`,
      description: `${text(character.name, "character.name")} 캐릭터 편집 검토 필요`,
      color: 0x5ea3c5,
      fields,
    },
  );
}

function shopItem(payload: Record<string, unknown>) {
  const item = record(payload.item, "item");
  return {
    label: `${text(item.icon, "item.icon", 20)} ${text(item.name, "item.name", 100)} (${text(item.slug, "item.slug", 100)})`,
    price: numberValue(item.price, "item.price"),
  };
}

function buildShopRequest(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const item = shopItem(payload);
  const requester = record(payload.requester, "requester");
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    { name: "요청 품목", value: item.label, inline: true },
    {
      name: "가격",
      value: `${item.price.toLocaleString("ko-KR")}C`,
      inline: true,
    },
    {
      name: "요청자",
      value: text(requester.displayName, "requester.displayName"),
      inline: true,
    },
    { name: "재고 관리", value: `[편의점 재고 확인](${SHOP_URL})` },
  ];
  return basePayload(
    "띠아",
    "편의점 발주 요청",
    isoTimestamp(payload.requestedAt),
    {
      url: SHOP_URL,
      description:
        "품절 상품 발주 요청이 들어왔어요.\nGM 재고 관리에서 입고 여부를 확인해 주세요.",
      color: 0xd95f5f,
      fields,
      footer: `${text(payload.today, "today", 40)} KST`,
      avatarUrl: env.DISCORD_WEBHOOK_SHOP_AVATAR_URL?.trim(),
    },
  );
}

function buildShopFulfilled(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const item = shopItem(payload);
  return basePayload(
    "띠아",
    "편의점 추가 입고 완료",
    isoTimestamp(payload.fulfilledAt),
    {
      url: SHOP_URL,
      description: "품목이 추가 입고됐어요.",
      color: 0xc5a059,
      fields: [
        { name: "입고 품목", value: item.label, inline: true },
        {
          name: "추가 수량 / 현재 재고",
          value: `+${numberValue(payload.quantity, "quantity").toLocaleString("ko-KR")} EA · ${numberValue(payload.stock, "stock").toLocaleString("ko-KR")} EA`,
          inline: true,
        },
        { name: "편의점으로 가기", value: `[띠아 편의점 들어가기](${SHOP_URL})` },
      ],
      footer: `${text(payload.today, "today", 40)} KST`,
      avatarUrl: env.DISCORD_WEBHOOK_SHOP_AVATAR_URL?.trim(),
    },
  );
}

function buildStockManualIntervention(
  payload: Record<string, unknown>,
): DiscordWebhookPayload {
  const actor = record(payload.actor, "actor");
  const ticker = text(payload.ticker, "ticker", 20);
  const previousPrice = numberValue(payload.previousPrice, "previousPrice");
  const price = numberValue(payload.price, "price");
  const percent =
    previousPrice > 0
      ? ((price - previousPrice) / previousPrice) * 100
      : 0;
  const signedPercent = `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
  const stock = findStockByTicker(ticker);
  return basePayload(
    "재무기구 시장감시실",
    "재무기구 특별 시세 공시",
    isoTimestamp(payload.occurredAt),
    {
      url: "https://www.ordonet.co.kr/erp/stock",
      description: "시장감시실장 승인에 따른 수동 조정 내역입니다.",
      color: price > previousPrice ? 0x2fbf71 : price < previousPrice ? 0xd95f5f : 0xc5a059,
      fields: [
        {
          name: "대상 종목",
          value: `${stock?.name ?? ticker} · ${ticker}`,
          inline: true,
        },
        {
          name: "조정 가격",
          value: `${previousPrice.toLocaleString("ko-KR")} CR → ${price.toLocaleString("ko-KR")} CR · ${signedPercent}`,
          inline: true,
        },
        {
          name: "조정 사유",
          value: text(payload.eventText, "eventText"),
        },
        {
          name: "승인 기록",
          value: `${text(actor.displayName, "actor.displayName")} · ${text(actor.role, "actor.role", 20)}`,
        },
      ],
    },
  );
}

function buildWebhookPayload(
  event: IntegrationOutboxEvent,
  env: Environment,
): DiscordWebhookPayload {
  switch (event.kind) {
    case "GM_ADMIN_AUDIT":
      return buildGmAudit(event.payload);
    case "CHARACTER_EDIT_WEBHOOK":
      return buildCharacterEdit(event.payload, env);
    case "EQUIPMENT_WORKSHOP_WEBHOOK":
      return buildWorkshop(event.payload, env);
    case "SHOP_REORDER_REQUEST_WEBHOOK":
      return buildShopRequest(event.payload, env);
    case "SHOP_REORDER_FULFILLED_WEBHOOK":
      return buildShopFulfilled(event.payload, env);
    case "STOCK_MANUAL_INTERVENTION_WEBHOOK":
      return buildStockManualIntervention(event.payload);
    case "PLAYER_TRADE_DM":
      throw new Error("PLAYER_TRADE_DM은 webhook payload가 아닙니다.");
  }
}

function escapeMarkdown(value: string, max: number): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[\\`*_{}[\]()#+\-.!|>~]/g, "\\$&");
}

function offerSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "제시 자산 없음";
  }
  const offer = value as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof offer.credits === "number" && offer.credits > 0) {
    lines.push(`${offer.credits.toLocaleString("ko-KR")} CR`);
  }
  if (Array.isArray(offer.items)) {
    for (const raw of offer.items.slice(0, 6)) {
      const item = record(raw, "offer.items");
      lines.push(
        `${escapeMarkdown(String(item.itemName ?? ""), 80)} × ${Number(item.quantity ?? 0).toLocaleString("ko-KR")}`,
      );
    }
  }
  if (Array.isArray(offer.stocks)) {
    for (const raw of offer.stocks.slice(0, 6)) {
      const stock = record(raw, "offer.stocks");
      lines.push(
        `${escapeMarkdown(String(stock.ticker ?? ""), 20)} ${Number(stock.shares ?? 0).toLocaleString("ko-KR")}주`,
      );
    }
  }
  return lines.length > 0 ? lines.slice(0, 6).join(" · ") : "제시 자산 없음";
}

function tradeDmContent(
  payload: Record<string, unknown>,
  env: Environment,
): string {
  const recipient = escapeMarkdown(
    text(payload.recipientCodename, "recipientCodename"),
    100,
  );
  const other = escapeMarkdown(
    text(payload.otherCharacterCodename, "otherCharacterCodename"),
    100,
  );
  const url = `${siteBaseUrl(env)}/erp/trades`;
  const suffix = `\n▶ 거래 대장: ${url}\n— NOVUS ORDO · REGISTRAR`;
  switch (payload.event) {
    case "EXCHANGE_OPENED":
      return `**◆ 자산 교환 요청이 등재되었습니다.**\n${recipient}님, ${other} 측에서 교환 절차를 개시했습니다.\n제시 자산: ${offerSummary(payload.offer)}${suffix}`;
    case "GIFT_RECEIVED":
      return `**◆ 자산 전달 기록이 확정되었습니다.**\n${recipient}님, ${other} 측에서 다음 자산을 전달했습니다.\n전달 자산: ${offerSummary(payload.offer)}${suffix}`;
    case "EXCHANGE_COMPLETED":
      return `**◆ 자산 교환 절차가 확정되었습니다.**\n${recipient}님, ${other} 측과의 교환이 체결되었습니다.${suffix}`;
    case "EXCHANGE_CANCELLED":
      return `**■ 자산 교환 요청이 기각되었습니다.**\n${recipient}님, ${other} 측과 진행하던 교환 절차가 취소되었습니다.${suffix}`;
    default:
      throw new Error(`지원하지 않는 PLAYER_TRADE_DM event입니다.`);
  }
}

function tradeDmNonce(
  payload: Record<string, unknown>,
  userId: string,
  recipientKind: DiscordDmRecipientKind,
): string {
  return createHash("sha256")
    .update(
      [
        "player-trade",
        text(payload.tradeId, "tradeId", 200),
        text(payload.event, "event", 50),
        userId,
        ...(recipientKind === "mirror" ? ["mirror"] : []),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 25);
}

function enabledKinds(env: Environment): IntegrationOutboxKind[] {
  const raw = env.WORKER_OUTBOX_KINDS?.trim();
  if (!raw) return [];
  const allowed = new Set<string>(INTEGRATION_OUTBOX_KINDS);
  return [...new Set(raw.split(",").map((value) => value.trim()))].map(
    (value) => {
      if (!allowed.has(value)) {
        throw new IntegrationOutboxConfigurationError(
          `지원하지 않는 WORKER_OUTBOX_KINDS 값입니다: ${value}`,
        );
      }
      return value as IntegrationOutboxKind;
    },
  );
}

export function createDiscordIntegrationOutboxHandlers(
  env: Environment = process.env,
  dependencies: DiscordHandlerDependencies = {},
): IntegrationOutboxHandlerRegistry {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const resolveRecipients =
    dependencies.resolveRecipients ?? resolveDiscordDmRecipients;
  const handlers: IntegrationOutboxDeliveryHandler[] = [];

  for (const kind of enabledKinds(env)) {
    if (kind === "PLAYER_TRADE_DM") {
      const botToken = env.REGISTRAR_DISCORD_BOT_TOKEN?.trim();
      if (!botToken) {
        throw new IntegrationOutboxConfigurationError(
          "PLAYER_TRADE_DM에 REGISTRAR_DISCORD_BOT_TOKEN이 필요합니다.",
        );
      }
      handlers.push({
        kind,
        async deliver(event) {
          if (event.version !== 1) {
            throw new Error(
              `지원하지 않는 PLAYER_TRADE_DM payload version입니다: ${event.version}`,
            );
          }
          const userId = text(event.payload.userId, "userId", 200);
          const resolution = await resolveRecipients(
            userId,
            { mirror: JTEST_DISCORD_DM_MIRROR_RULE },
          );
          if (
            resolution.sourceState !== "active" ||
            resolution.recipients.length === 0
          ) {
            return;
          }

          const content = tradeDmContent(event.payload, env);
          const errors: unknown[] = [];
          let sentCount = 0;
          for (const recipient of resolution.recipients) {
            try {
              await sendDiscordDirectMessage(
                {
                  recipientId: recipient.discordId,
                  content,
                  nonce: tradeDmNonce(
                    event.payload,
                    userId,
                    recipient.kind,
                  ),
                  botToken,
                },
                fetchImpl,
              );
              sentCount += 1;
            } catch (error) {
              errors.push(error);
            }
          }

          const retryableError = errors.find(
            (error) =>
              !(
                error instanceof DiscordDeliveryError &&
                error.status === 403
              ),
          );
          if (retryableError) throw retryableError;
          if (sentCount > 0) return;
        },
      });
      continue;
    }

    const webhookUrl = webhookUrlFor(kind, env);
    handlers.push({
      kind,
      async deliver(event) {
        if (event.version !== 1) {
          throw new Error(
            `지원하지 않는 ${kind} payload version입니다: ${event.version}`,
          );
        }
        await sendDiscordWebhook(
          webhookUrl,
          buildWebhookPayload(event, env),
          fetchImpl,
        );
      },
    });
  }

  return new IntegrationOutboxHandlerRegistry(handlers);
}
