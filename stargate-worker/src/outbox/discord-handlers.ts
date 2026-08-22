import { createHash } from "node:crypto";

import {
  buildRegistrarTradeDiscordDmContent,
  type RegistrarTradeDmEvent,
} from "@stargate/core/domain/discord-dm-dialogue";
import { findStockByTicker } from "@stargate/core/domain/stock-catalog";
import {
  INTEGRATION_OUTBOX_KINDS,
  findCharacterById,
  findResearchLabJob,
  findUserById,
  getDb,
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
import {
  DiscordRouteConfigurationError,
  resolveIntegrationWebhookUrl,
} from "./discord-routing.js";
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
const ACTOR_KIND_LABELS: Record<string, string> = {
  PLAYER: "플레이어",
  GM: "GM",
  BOT: "봇",
  SYSTEM: "시스템",
  SERVICE: "서비스",
};
const WORKFLOW_STAGE_LABELS: Record<string, string> = {
  REQUESTED: "📝 접수",
  IN_REVIEW: "🔎 검토 중",
  QUOTED: "📄 견적 발행",
  OPENED: "📬 시작",
  OFFER_UPDATED: "✏️ 제안 변경",
  PARTICIPANT_CONFIRMED: "🤝 참여자 확인",
  IN_PROGRESS: "🛠️ 작업 중",
  READY: "📦 수령 가능",
  STARTED: "🚀 연구 시작",
  RUSHED: "⚡ 연구 가속",
  APPLIED: "✅ 연구 적용",
  FULFILLED: "📦 입고 완료",
  ADJUSTED: "📊 잔액 조정",
  SET: "🎯 잔액 설정",
  APPROVED: "✅ 승인",
  CLOSED_APPROVED: "✅ 가결 마감",
  COMPLETED: "🎉 완료",
  DECLINED: "⛔ 견적 거절",
  REJECTED: "⛔ 반려",
  CLOSED_REJECTED: "⛔ 부결 마감",
  CANCELLED: "🚫 취소",
};
const CHARACTER_FIELD_LABELS: Record<string, string> = {
  name: "이름",
  codename: "코드네임",
  type: "캐릭터 유형",
  tier: "등급",
  agentLevel: "요원 등급",
  department: "부서",
  faction: "소속 세력",
  institution: "소속 기관",
  isPublic: "공개 여부",
  previewImage: "미리보기 이미지",
  avatar: "아바타",
  lore: "설정",
  play: "플레이 정보",
  quote: "대표 대사",
  description: "설명",
  personality: "성격",
  background: "배경",
  abilities: "능력",
  equipment: "장비",
};

type Environment = NodeJS.ProcessEnv;

interface DiscordHandlerDependencies {
  fetchImpl?: typeof fetch;
  findCharacter?: typeof findCharacterById;
  findResearchJob?: typeof findResearchLabJob;
  findUser?: (id: string) => Promise<User | null>;
  isWorkflowEventCurrent?: (
    payload: Record<string, unknown>,
  ) => Promise<boolean>;
}

export class IntegrationOutboxConfigurationError extends DiscordRouteConfigurationError {
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

function characterFieldLabel(value: unknown): string {
  const path = text(value, "changes.field", FIELD_NAME_MAX);
  return path
    .split(".")
    .map((segment) => CHARACTER_FIELD_LABELS[segment] ?? sanitize(segment))
    .join(" · ");
}

function workflowStageLabel(stage: string): string {
  return WORKFLOW_STAGE_LABELS[stage] ?? `ℹ️ ${sanitize(stage)}`;
}

function workflowTrackingCode(workflowId: string): string {
  return createHash("sha256")
    .update(workflowId)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
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

function webhookUrlFor(
  kind: IntegrationOutboxKind,
  env: Environment,
): string {
  if (
    kind === "PLAYER_TRADE_DM" ||
    kind === "RESEARCH_LAB_DM" ||
    kind === "STOCK_MARKET_RECOVERY_REQUEST"
  ) {
    throw new IntegrationOutboxConfigurationError(
      `${kind}은 Discord webhook route가 아닙니다.`,
    );
  }
  try {
    return resolveIntegrationWebhookUrl(kind, env);
  } catch (error) {
    if (error instanceof DiscordRouteConfigurationError) {
      throw new IntegrationOutboxConfigurationError(error.message);
    }
    throw new IntegrationOutboxConfigurationError(
      `${kind} Discord webhook route를 해석하지 못했습니다.`,
    );
  }
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
      name: characterFieldLabel(change.field),
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
      description: `${text(character.name, "character.name")}의 공방 요청입니다. 접수 내용과 처리 가능 여부를 검토해 주세요.`,
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
  const lotteryName =
    typeof payload.lotteryName === "string" && payload.lotteryName.trim()
      ? text(payload.lotteryName, "lotteryName", 100)
      : "미스터비스트 복권";
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
    `🎉 ${lotteryName} ${presentation.label} 당첨!`,
    isoTimestamp(payload.revealedAt),
    {
      url: SHOP_URL,
      description: `${text(character.codename, "character.codename", 100)} 요원이 ${lotteryName} ${presentation.label}에 당첨됐어요!`,
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
      footer: `${lotteryName} 고액 당첨 공지`,
      avatarUrl: env.DISCORD_WEBHOOK_SHOP_AVATAR_URL?.trim(),
    },
  );
}

function buildStockManualIntervention(
  payload: Record<string, unknown>,
): DiscordWebhookPayload {
  const actor = record(payload.actor, "actor");
  const eventKind = payload.eventKind === undefined
    ? "PRICE"
    : text(payload.eventKind, "eventKind", 30);
  if (!["PRICE", "HALT", "RESUME", "COOLDOWN", "COOLDOWN_RELEASE", "SHOCK_DISCLOSURE", "RIGHTS_OFFERING_REJECTED"].includes(eventKind)) {
    throw new Error("지원하지 않는 주식 긴급 공시 eventKind입니다.");
  }
  if (
    (eventKind === "COOLDOWN" || eventKind === "COOLDOWN_RELEASE") &&
    Array.isArray(payload.items)
  ) {
    if (payload.items.length === 0 || payload.items.length > 50) {
      throw new Error("주식 냉각 묶음 공시의 종목 수가 올바르지 않습니다.");
    }
    const seenTickers = new Set<string>();
    const items = payload.items.map((value, index) => {
      const item = record(value, `items[${index}]`);
      const ticker = text(item.ticker, `items[${index}].ticker`, 20);
      if (seenTickers.has(ticker)) {
        throw new Error("주식 냉각 묶음 공시에 중복 종목이 있습니다.");
      }
      seenTickers.add(ticker);
      return {
        ticker,
        previousPrice: numberValue(
          item.previousPrice,
          `items[${index}].previousPrice`,
        ),
        price: numberValue(item.price, `items[${index}].price`),
        reason: text(item.eventText, `items[${index}].eventText`, 200),
      };
    });
    const targetLines = items.map((item) => {
      const stock = findStockByTicker(item.ticker);
      if (eventKind === "COOLDOWN_RELEASE") {
        return `• ${stock?.name ?? item.ticker} · ${item.ticker}`;
      }
      const percent = item.previousPrice > 0
        ? ((item.price - item.previousPrice) / item.previousPrice) * 100
        : 0;
      const direction = percent === 0 ? "보합" : percent > 0 ? "상승" : "하락";
      const signedPercent = `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
      return `• ${stock?.name ?? item.ticker} · ${item.ticker} — ${direction} ${signedPercent} · ${item.previousPrice.toLocaleString("ko-KR")} CR → ${item.price.toLocaleString("ko-KR")} CR`;
    });
    const reasonLabels = Array.from(new Set(items.map((item) => {
      if (item.reason === "VOLATILITY_12_PERCENT") return "회차 변동률 12% 이상";
      if (item.reason === "GM_FORCE_COOLDOWN") return "시장감시실 강제 냉각";
      return item.reason;
    })));
    const releasing = eventKind === "COOLDOWN_RELEASE";
    return basePayload(
      "재무기구 시장감시실",
      releasing ? "변동성 냉각 해제" : "변동성 냉각 공시",
      isoTimestamp(payload.occurredAt),
      {
        url: "https://www.ordonet.co.kr/erp/stock",
        description: releasing
          ? `${items.length}개 종목의 자동 냉각이 일괄 종료되었습니다. 수동 거래정지와 시장 운영 상태는 별도로 적용됩니다.`
          : `급격한 가격 변동으로 ${items.length}개 종목에 10분 자동 냉각이 일괄 적용되었습니다.`,
        color: releasing ? 0x2fbf71 : 0xf0a33b,
        fields: [
          {
            name: `${releasing ? "해제" : "냉각"} 종목 · ${items.length}개`,
            value: targetLines.join("\n").slice(0, FIELD_VALUE_MAX),
          },
          {
            name: "시장 상태",
            value: releasing ? "냉각 해제" : "자동 냉각",
            inline: true,
          },
          ...(!releasing
            ? [{
                name: "적용 사유",
                value: reasonLabels.join(" · ").slice(0, FIELD_VALUE_MAX),
                inline: true,
              }]
            : []),
          {
            name: "승인 기록",
            value: `${text(actor.displayName, "actor.displayName")} · ${text(actor.role, "actor.role", 20)}`,
          },
        ],
      },
    );
  }
  const ticker = text(payload.ticker, "ticker", 20);
  const previousPrice = eventKind === "PRICE"
    ? numberValue(payload.previousPrice, "previousPrice")
    : typeof payload.previousPrice === "number" ? payload.previousPrice : undefined;
  const price = eventKind === "PRICE"
    ? numberValue(payload.price, "price")
    : typeof payload.price === "number" ? payload.price : undefined;
  const hasMove = previousPrice !== undefined && price !== undefined;
  const percent =
    hasMove && previousPrice! > 0
      ? ((price! - previousPrice!) / previousPrice!) * 100
      : 0;
  const signedPercent = `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
  const moveLine = hasMove
    ? `${previousPrice!.toLocaleString("ko-KR")} CR → ${price!.toLocaleString("ko-KR")} CR · ${signedPercent}`
    : undefined;
  const directionLabel = !hasMove || percent === 0
    ? "보합"
    : percent > 0 ? "상승" : "하락";
  // 공시 문안만으로는 방향을 알 수 없으므로 등락이 실린 카드는 색도 등락에 맞춘다.
  const moveColor = !hasMove || percent === 0
    ? 0xc5a059
    : percent > 0 ? 0x2fbf71 : 0xd95f5f;
  const stock = findStockByTicker(ticker);
  const presentation = {
    PRICE: { title: "재무기구 특별 시세 공시", description: "시장감시실장 승인에 따른 수동 조정 내역입니다.", state: "수동 가격 조정", color: moveColor },
    HALT: { title: "긴급 거래정지 공시", description: "해당 종목의 모든 플레이어 거래가 즉시 정지되었습니다.", state: "거래정지", color: 0xd95f5f },
    RESUME: { title: "거래재개 공시", description: "시장감시실 확인을 거쳐 해당 종목 거래가 재개되었습니다.", state: "거래재개", color: 0x2fbf71 },
    COOLDOWN: { title: "변동성 냉각 공시", description: "급격한 가격 변동으로 10분 자동 냉각이 적용되었습니다.", state: "자동 냉각", color: 0xf0a33b },
    COOLDOWN_RELEASE: { title: "변동성 냉각 해제", description: "자동 냉각이 종료되었습니다. 수동 거래정지와 시장 운영 상태는 별도로 적용됩니다.", state: "냉각 해제", color: 0x2fbf71 },
    SHOCK_DISCLOSURE: { title: "NOVEX 충격 공시", description: "시장에 중대한 영향을 주는 공시가 공개되었습니다.", state: "충격 공시", color: hasMove ? moveColor : 0xd95f5f },
    RIGHTS_OFFERING_REJECTED: { title: "유상증자 안전 거절", description: "안전성 검증 실패로 예정된 유상증자를 중단했습니다. 해당 종목의 기존 거래 상태는 유지됩니다.", state: "실행 거절", color: 0xd95f5f },
  }[eventKind]!;
  const stateValue = eventKind === "PRICE" && moveLine
    ? moveLine
    : (eventKind === "SHOCK_DISCLOSURE" || eventKind === "COOLDOWN") && moveLine
      ? `${presentation.state} · ${directionLabel}\n${moveLine}`
      : presentation.state;
  return basePayload(
    "재무기구 시장감시실",
    presentation.title,
    isoTimestamp(payload.occurredAt),
    {
      url: "https://www.ordonet.co.kr/erp/stock",
      description: presentation.description,
      color: presentation.color,
      fields: [
        {
          name: "대상 종목",
          value: `${stock?.name ?? ticker} · ${ticker}`,
          inline: true,
        },
        {
          name: eventKind === "PRICE" ? "조정 가격" : "시장 상태",
          value: stateValue,
          inline: true,
        },
        {
          name: eventKind === "PRICE" ? "조정 사유" : "공시 사유",
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

function buildWorkflowStatus(
  payload: Record<string, unknown>,
  env: Environment,
): DiscordWebhookPayload {
  const actor = record(payload.actor, "actor");
  const workflow = text(payload.workflow, "workflow", 50);
  const labels: Record<string, string> = {
    EQUIPMENT_WORKSHOP: "공방",
    PLAYER_TRADE: "플레이어 거래",
    SHOP_REORDER: "편의점 발주",
    BUREAUCRAT_VOTE: "관료 표결",
    EQUIPMENT_RESEARCH: "장비 연구",
    OPERATION_CREDIT: "작전 크레딧",
  };
  const workflowLabel = labels[workflow];
  if (!workflowLabel) {
    throw new Error(`지원하지 않는 workflow입니다: ${workflow}`);
  }
  const stage = text(payload.stage, "stage", 80);
  const stageLabel = workflowStageLabel(stage);
  const actorKind = text(actor.kind, "actor.kind", 20);
  const actorKindLabel = ACTOR_KIND_LABELS[actorKind] ?? sanitize(actorKind);
  const fields: DiscordWebhookPayload["embeds"][number]["fields"] = [
    { name: "단계", value: stageLabel, inline: true },
    {
      name: "처리 주체",
      value: `${text(actor.displayName, "actor.displayName", 100)} · ${actorKindLabel}`,
      inline: true,
    },
    { name: "진행 내용", value: text(payload.summary, "summary") },
  ];
  const target = optionalText(payload.target);
  if (target) fields.push({ name: "대상", value: target });
  if (Array.isArray(payload.delegatedTo) && payload.delegatedTo.length > 0) {
    fields.push({
      name: "위임 흐름",
      value: payload.delegatedTo
        .slice(0, 10)
        .map((value) => text(value, "delegatedTo", 100))
        .join(" → "),
    });
  }
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
  const urlPath = optionalText(payload.urlPath, 500);
  const url = urlPath?.startsWith("/")
    ? `${siteBaseUrl(env)}${urlPath}`
    : undefined;
  const revision =
    typeof payload.revision === "number" && Number.isSafeInteger(payload.revision)
      ? ` · 개정 ${payload.revision}`
      : "";
  const trackingCode = workflowTrackingCode(
    text(payload.workflowId, "workflowId", 200),
  );
  return basePayload(
    "StarGate Workflow Watch",
    `${workflowLabel} 진행 · ${stageLabel}`,
    isoTimestamp(payload.occurredAt),
    {
      ...(url ? { url } : {}),
      color:
        stage === "CANCELLED" ||
        stage === "REJECTED" ||
        stage === "DECLINED" ||
        stage.endsWith("_REJECTED")
        ? 0xd95f5f
        : stage === "COMPLETED" ||
            stage === "FULFILLED" ||
            stage === "APPROVED" ||
            stage.endsWith("_APPROVED")
          ? 0x2fbf71
          : 0x5ea3c5,
      fields,
      footer: `추적 ${trackingCode}${revision}`,
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
    case "WORKFLOW_STATUS_WEBHOOK":
      return buildWorkflowStatus(event.payload, env);
    case "PLAYER_TRADE_DM":
      throw new Error("PLAYER_TRADE_DM은 webhook payload가 아닙니다.");
    case "RESEARCH_LAB_DM":
      throw new Error("RESEARCH_LAB_DM은 webhook payload가 아닙니다.");
    case "STOCK_MARKET_RECOVERY_REQUEST":
      throw new Error("STOCK_MARKET_RECOVERY_REQUEST는 webhook payload가 아닙니다.");
  }
}

async function isWorkflowEventCurrent(
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (
    payload.workflow !== "EQUIPMENT_WORKSHOP" ||
    payload.stage !== "READY"
  ) {
    return true;
  }
  const workflowId = text(payload.workflowId, "workflowId", 200);
  const db = await getDb();
  const request = await db
    .collection<{ _id: string; status: string }>(
      "equipment_workshop_requests",
    )
    .findOne({ _id: workflowId }, { projection: { status: 1 } });
  return request?.status === "IN_PROGRESS";
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

function researchLabDmContent(
  payload: Record<string, unknown>,
  env: Environment,
): string {
  const event = text(payload.event, "event", 50);
  const recipeId = text(payload.recipeId, "recipeId", 50);
  const outputName = text(payload.outputName, "outputName", 100);
  const deadline = optionalText(payload.claimDeadline, 100);
  const url = `${siteBaseUrl(env)}/erp/research`;
  const messages: Record<string, string> = {
    INITIAL_COMPLETED:
      `${recipeId} 최초 연구가 끝났어. ${outputName}은 공용 인벤토리에 넣었고, 반복 생산도 열어 뒀지.`,
    SHARED_COMPLETED:
      `${recipeId} 생산이 끝났어. ${outputName}은 공용 인벤토리에 넣었다.`,
    CHARACTER_CLAIMABLE:
      `${recipeId} 생산이 끝났어. ${outputName}을 6시간 안에 직접 수령해. 기한이 지나면 공용으로 돌린다.${deadline ? `\n수령 마감: ${deadline}` : ""}`,
    CHARACTER_CLAIM_REMINDER:
      `${outputName} 수령 마감까지 1시간 남았어. 놓치면 공용 인벤토리로 보낸다.${deadline ? `\n수령 마감: ${deadline}` : ""}`,
    CHARACTER_DIVERTED:
      `${outputName} 수령 기한이 끝났어. 약속대로 공용 인벤토리로 전환했다.`,
  };
  const message = messages[event];
  if (!message) throw new Error(`지원하지 않는 RESEARCH_LAB_DM event입니다: ${event}`);
  return `**제노 연구소**\n${message}\n${url}`;
}

function enabledKinds(env: Environment): IntegrationOutboxKind[] {
  const discordKinds = INTEGRATION_OUTBOX_KINDS.filter(
    (kind) => kind !== "STOCK_MARKET_RECOVERY_REQUEST",
  );
  const raw = env.WORKER_OUTBOX_KINDS?.trim();
  if (!raw) {
    throw new IntegrationOutboxConfigurationError(
      "active worker에는 WORKER_OUTBOX_KINDS=all 설정이 필요합니다.",
    );
  }
  if (raw.toLowerCase() === "all") {
    return [...discordKinds];
  }
  const allowed = new Set<string>(discordKinds);
  const values = [...new Set(raw.split(",").map((value) => value.trim()))]
    .filter(Boolean)
    .map(
    (value) => {
      if (!allowed.has(value)) {
        throw new IntegrationOutboxConfigurationError(
          `지원하지 않는 WORKER_OUTBOX_KINDS 값입니다: ${value}`,
        );
      }
      return value as IntegrationOutboxKind;
    },
  );
  if (
    env.WORKER_OUTBOX_ALLOW_PARTIAL?.trim().toLowerCase() !== "true" &&
    values.length !== discordKinds.length
  ) {
    const configured = new Set(values);
    const missing = discordKinds.filter(
      (kind) => !configured.has(kind),
    );
    throw new IntegrationOutboxConfigurationError(
      `WORKER_OUTBOX_KINDS가 전체 delivery kind를 포함해야 합니다. 누락: ${missing.join(", ")}. 전체 활성화는 all을 사용하세요.`,
    );
  }
  return values;
}

export function createDiscordIntegrationOutboxHandlers(
  env: Environment = process.env,
  dependencies: DiscordHandlerDependencies = {},
): IntegrationOutboxHandlerRegistry {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const findCharacter = dependencies.findCharacter ?? findCharacterById;
  const findResearchJob =
    dependencies.findResearchJob ?? findResearchLabJob;
  const findUser = dependencies.findUser ?? findUserById;
  const workflowEventIsCurrent =
    dependencies.isWorkflowEventCurrent ?? isWorkflowEventCurrent;
  const handlers: IntegrationOutboxDeliveryHandler[] = [];

  for (const kind of enabledKinds(env)) {
    if (kind === "STOCK_MARKET_RECOVERY_REQUEST") continue;
    if (kind === "RESEARCH_LAB_DM") {
      const botToken = env.REGISTRAR_DISCORD_BOT_TOKEN?.trim();
      if (!botToken) {
        throw new IntegrationOutboxConfigurationError(
          "RESEARCH_LAB_DM에 REGISTRAR_DISCORD_BOT_TOKEN이 필요합니다.",
        );
      }
      handlers.push({
        kind,
        async deliver(event) {
          if (event.version !== 1) {
            throw new Error(
              `지원하지 않는 RESEARCH_LAB_DM payload version입니다: ${event.version}`,
            );
          }
          const researchEvent = text(event.payload.event, "event", 50);
          const researchJobId = text(event.payload.jobId, "jobId", 200);
          if (
            researchEvent === "CHARACTER_CLAIMABLE" ||
            researchEvent === "CHARACTER_CLAIM_REMINDER"
          ) {
            const currentJob = await findResearchJob(researchJobId);
            const deliveryNow = new Date();
            if (
              currentJob?.status !== "CLAIMABLE" ||
              !(currentJob.claimDeadline instanceof Date) ||
              currentJob.claimDeadline <= deliveryNow
            ) {
              return { outcome: "SKIPPED", reason: "STALE" };
            }
          }
          const userId = text(event.payload.userId, "userId", 200);
          const user = await findUser(userId);
          if (!user || user.status !== "ACTIVE") {
            return { outcome: "SKIPPED", reason: "RECIPIENT_INACTIVE" };
          }
          if (!user.discordId || !SNOWFLAKE.test(user.discordId)) {
            return { outcome: "SKIPPED", reason: "RECIPIENT_UNLINKED" };
          }
          const nonce = createHash("sha256")
            .update(`research-lab:${researchJobId}:${researchEvent}:${userId}`)
            .digest("hex")
            .slice(0, 25);
          try {
            const externalMessageId = await sendDiscordDirectMessage(
              {
                recipientId: user.discordId,
                content: researchLabDmContent(event.payload, env),
                nonce,
                botToken,
              },
              fetchImpl,
            );
            return { outcome: "SENT", externalMessageId };
          } catch (error) {
            if (error instanceof DiscordDeliveryError && error.status === 403) {
              return { outcome: "SKIPPED", reason: "RECIPIENT_UNREACHABLE" };
            }
            throw error;
          }
        },
      });
      continue;
    }
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
          if (!user || user.status !== "ACTIVE") {
            return { outcome: "SKIPPED", reason: "RECIPIENT_INACTIVE" };
          }
          if (!user.discordId || !SNOWFLAKE.test(user.discordId)) {
            return { outcome: "SKIPPED", reason: "RECIPIENT_UNLINKED" };
          }
          const nonce = createHash("sha256")
            .update(
              `player-trade:${text(event.payload.tradeId, "tradeId", 200)}:${text(event.payload.event, "event", 50)}:${userId}`,
            )
            .digest("hex")
            .slice(0, 25);
          try {
            const externalMessageId = await sendDiscordDirectMessage(
              {
                recipientId: user.discordId,
                content: tradeDmContent(event.payload, env),
                nonce,
                botToken,
              },
              fetchImpl,
            );
            return { outcome: "SENT", externalMessageId };
          } catch (error) {
            if (error instanceof DiscordDeliveryError && error.status === 403) {
              return {
                outcome: "SKIPPED",
                reason: "RECIPIENT_UNREACHABLE",
              };
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
          if (!currentCharacter || currentCharacter.isPublic !== true) {
            return { outcome: "SKIPPED", reason: "NOT_PUBLIC" };
          }
          const externalMessageId = await sendDiscordWebhook(
            webhookUrl,
            buildMrBeastLotteryWinner(event.payload, env),
            fetchImpl,
          );
          return { outcome: "SENT", externalMessageId };
        },
      });
      continue;
    }

    if (kind === "WORKFLOW_STATUS_WEBHOOK") {
      const webhookUrl = webhookUrlFor(kind, env);
      handlers.push({
        kind,
        async deliver(event) {
          if (event.version !== 1) {
            throw new Error(
              `지원하지 않는 ${kind} payload version입니다: ${event.version}`,
            );
          }
          if (!(await workflowEventIsCurrent(event.payload))) {
            return { outcome: "SKIPPED", reason: "STALE" };
          }
          const externalMessageId = await sendDiscordWebhook(
            webhookUrl,
            buildWorkflowStatus(event.payload, env),
            fetchImpl,
          );
          return { outcome: "SENT", externalMessageId };
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
        const externalMessageId = await sendDiscordWebhook(
          webhookUrl,
          buildWebhookPayload(event, env),
          fetchImpl,
        );
        return { outcome: "SENT", externalMessageId };
      },
    });
  }

  return new IntegrationOutboxHandlerRegistry(handlers);
}
