import { createHash } from "node:crypto";

import {
  buildRegistrarTradeDiscordDmContent,
  type RegistrarTradeDmEvent,
} from "@stargate/core/domain/discord-dm-dialogue";
import { findStockByTicker } from "@stargate/core/domain/stock-catalog";
import {
  INTEGRATION_OUTBOX_KINDS,
  findCharacterById,
  findUserById,
  type IntegrationOutboxEvent,
  type IntegrationOutboxKind,
  type User,
} from "@stargate/shared-db";

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
const SNOWFLAKE = /^\d{17,20}$/;
const LOCAL_ASSET_PATTERN = /^\/assets\/[a-zA-Z0-9_./-]+$/;
const SHOP_GROUP_LABELS: Record<string, string> = {
  BASIC: "기본 물품",
  RECOVERY: "회복 물품",
  LUXURY: "기호품",
  RARE: "희귀 물품",
};

type Environment = NodeJS.ProcessEnv;

interface DiscordHandlerDependencies {
  fetchImpl?: typeof fetch;
  findCharacter?: typeof findCharacterById;
  findUser?: (id: string) => Promise<User | null>;
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

function localAssetUrl(value: unknown, env: Environment): string | null {
  if (
    typeof value !== "string" ||
    !LOCAL_ASSET_PATTERN.test(value) ||
    value.includes("//") ||
    value
      .slice("/assets/".length)
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return new URL(value, `${siteBaseUrl(env)}/`).toString();
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
      : kind === "SHOP_REORDER_FULFILLED_WEBHOOK" ||
          kind === "SHOP_PRODUCT_LAUNCH_WEBHOOK" ||
          kind === "MRBEAST_LOTTERY_WINNER_WEBHOOK"
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
    imageUrl?: string;
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
        ...(options.imageUrl ? { image: { url: options.imageUrl } } : {}),
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

function buildShopProductLaunch(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const rawItem = record(payload.item, "item");
  const item = shopItem(payload);
  const pageGroup = text(rawItem.pageGroup, "item.pageGroup", 20);
  const pageGroupLabel = SHOP_GROUP_LABELS[pageGroup];
  if (!pageGroupLabel) {
    throw new Error(`지원하지 않는 편의점 pageGroup입니다: ${pageGroup}`);
  }
  const description = optionalText(rawItem.description);
  const effect = optionalText(rawItem.effect);
  const previewImageUrl = localAssetUrl(rawItem.previewImage, env);
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    { name: "신제품", value: item.label, inline: true },
    {
      name: "분류 / 가격",
      value: `${pageGroupLabel} · ${item.price.toLocaleString("ko-KR")}C`,
      inline: true,
    },
  ];
  if (description) {
    fields.push({ name: "상품 안내", value: description });
  }
  if (effect) {
    fields.push({ name: "사용 효과", value: effect });
  }
  fields.push({
    name: "편의점으로 가기",
    value: `[띠아 편의점에서 신제품 보기](${SHOP_URL})`,
  });

  return basePayload(
    "띠아",
    "띠아 편의점 신제품 출시",
    isoTimestamp(payload.launchedAt),
    {
      url: SHOP_URL,
      description: `새 물건이 들어왔어요! 이번 신제품은 ${item.label}예요.\n제가 먼저 시험해 본 건 아니지만… 꽤 괜찮아 보이죠? 오늘부터 편의점에서 만나 보세요!`,
      color: 0xc5a059,
      fields,
      footer: "띠아 편의점 신제품 알림",
      avatarUrl: env.DISCORD_WEBHOOK_SHOP_AVATAR_URL?.trim(),
      ...(previewImageUrl ? { imageUrl: previewImageUrl } : {}),
    },
  );
}

function buildMrBeastLotteryWinner(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const character = record(payload.character, "character");
  const tier = text(payload.tier, "tier", 20);
  const tierPresentation: Record<string, { label: string; color: number }> = {
    second: { label: "2등", color: 0x5ea3c5 },
    first: { label: "1등", color: 0xc5a059 },
    zeroth: { label: "0등", color: 0xff4d6d },
  };
  const presentation = tierPresentation[tier];
  if (!presentation) {
    throw new Error(`공지 대상이 아닌 미스터비스트 복권 등수입니다: ${tier}`);
  }
  const reward = numberValue(payload.reward, "reward");
  if (!Number.isSafeInteger(reward) || reward <= 0) {
    throw new Error("미스터비스트 복권 보상은 양의 안전한 정수여야 합니다.");
  }

  return basePayload(
    "띠아",
    `🎉 미스터비스트 복권 ${presentation.label} 당첨!`,
    isoTimestamp(payload.revealedAt),
    {
      url: SHOP_URL,
      description: `${text(character.codename, "character.codename", 100)} 요원이 미스터비스트 복권 ${presentation.label}에 당첨됐어요!`,
      color: presentation.color,
      fields: [
        {
          name: "당첨자",
          value: text(character.codename, "character.codename", 100),
          inline: true,
        },
        {
          name: "당첨 등수",
          value: presentation.label,
          inline: true,
        },
        {
          name: "당첨 보상",
          value: `+${reward.toLocaleString("ko-KR")} CR`,
          inline: true,
        },
        {
          name: "복권 확인",
          value: `[띠아 편의점으로 가기](${SHOP_URL})`,
        },
      ],
      footer: "미스터비스트 복권 고액 당첨 공지",
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
    case "SHOP_PRODUCT_LAUNCH_WEBHOOK":
      return buildShopProductLaunch(event.payload, env);
    case "MRBEAST_LOTTERY_WINNER_WEBHOOK":
      return buildMrBeastLotteryWinner(event.payload, env);
    case "STOCK_MANUAL_INTERVENTION_WEBHOOK":
      return buildStockManualIntervention(event.payload);
    case "PLAYER_TRADE_DM":
      throw new Error("PLAYER_TRADE_DM은 webhook payload가 아닙니다.");
  }
}

function tradeDmEvent(value: unknown): RegistrarTradeDmEvent {
  switch (value) {
    case "EXCHANGE_OPENED":
    case "GIFT_RECEIVED":
    case "EXCHANGE_COMPLETED":
    case "EXCHANGE_CANCELLED":
      return value;
    default:
      throw new Error("지원하지 않는 PLAYER_TRADE_DM event입니다.");
  }
}

function tradeDmContent(
  payload: Record<string, unknown>,
  env: Environment,
): string {
  return buildRegistrarTradeDiscordDmContent({
    event: tradeDmEvent(payload.event),
    recipientCodename: text(
      payload.recipientCodename,
      "recipientCodename",
      100,
    ),
    otherCharacterCodename: text(
      payload.otherCharacterCodename,
      "otherCharacterCodename",
      100,
    ),
    offer: payload.offer,
    tradeUrl: `${siteBaseUrl(env)}/erp/trades`,
  });
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
  const findCharacter = dependencies.findCharacter ?? findCharacterById;
  const findUser = dependencies.findUser ?? findUserById;
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
          const user = await findUser(userId);
          if (
            !user ||
            user.status !== "ACTIVE" ||
            !user.discordId ||
            !SNOWFLAKE.test(user.discordId)
          ) {
            return;
          }
          const nonce = createHash("sha256")
            .update(
              `player-trade:${text(event.payload.tradeId, "tradeId", 200)}:${text(event.payload.event, "event", 50)}:${userId}`,
            )
            .digest("hex")
            .slice(0, 25);
          try {
            await sendDiscordDirectMessage(
              {
                recipientId: user.discordId,
                content: tradeDmContent(event.payload, env),
                nonce,
                botToken,
              },
              fetchImpl,
            );
          } catch (error) {
            if (error instanceof DiscordDeliveryError && error.status === 403) {
              return;
            }
            throw error;
          }
        },
      });
      continue;
    }

    if (kind === "MRBEAST_LOTTERY_WINNER_WEBHOOK") {
      const webhookUrl = webhookUrlFor(kind, env);
      handlers.push({
        kind,
        async deliver(event) {
          if (event.version !== 1) {
            throw new Error(
              `지원하지 않는 ${kind} payload version입니다: ${event.version}`,
            );
          }
          const character = record(event.payload.character, "character");
          const currentCharacter = await findCharacter(
            text(character.id, "character.id", 200),
          );
          if (!currentCharacter || currentCharacter.isPublic !== true) return;
          await sendDiscordWebhook(
            webhookUrl,
            buildMrBeastLotteryWinner(event.payload, env),
            fetchImpl,
          );
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
