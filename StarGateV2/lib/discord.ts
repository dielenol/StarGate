import type { ApplyFormInput, ContactFormInput } from "@/lib/validators";

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  timestamp: string;
};

export type DiscordPayload = {
  username: string;
  avatar_url?: string;
  allowed_mentions?: { parse: string[] };
  embeds: DiscordEmbed[];
};

const DISCORD_COLORS = {
  apply: 0xc5a059,
  contact: 0x5ea3c5,
  shopRestock: 0xc5a059,
  shopReorder: 0xd95f5f,
  /** 캐릭터 편집 — admin 모드 (관리자 편집 강조 색상) */
  charEditAdmin: 0xc5a059,
  /** 캐릭터 편집 — player 모드 (일반 인포 톤) */
  charEditPlayer: 0x5ea3c5,
};

// Webhook URL은 서버 환경변수에서만 읽어 클라이언트 노출을 방지합니다.
function getWebhookUrl() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL 환경변수가 설정되지 않았습니다.");
  }

  return webhookUrl;
}

function buildPayload(title: string, color: number, fields: DiscordEmbedField[]): DiscordPayload {
  return {
    username: "StarGate Intake Bot",
    embeds: [
      {
        title,
        color,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function sendDiscordWebhook(payload: DiscordPayload, urlOverride?: string) {
  const webhookUrl = urlOverride ?? getWebhookUrl();
  // Discord Webhook은 단순 POST 요청으로 동작합니다.
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord Webhook 전송 실패 (${response.status}): ${errorText}`);
  }
}

function getEquipmentResearchWebhookUrl(): string {
  const webhookUrl = process.env.DISCORD_WEBHOOK_RESEARCH_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_RESEARCH_URL 환경변수가 설정되지 않았습니다.");
  }
  return webhookUrl;
}

function buildWebhookMessageUrl(webhookUrl: string, messageId: string): string {
  const url = new URL(webhookUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/messages/${encodeURIComponent(messageId)}`;
  url.search = "";
  return url.toString();
}

export async function createEquipmentResearchDiscordCard(
  payload: DiscordPayload,
): Promise<string> {
  const url = new URL(getEquipmentResearchWebhookUrl());
  url.searchParams.set("wait", "true");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord 연구 카드 생성 실패 (${response.status}): ${errorText}`,
    );
  }
  const message = (await response.json()) as { id?: unknown };
  if (typeof message.id !== "string" || message.id.length === 0) {
    throw new Error("Discord 연구 카드 생성 응답에 message id가 없습니다.");
  }
  return message.id;
}

export async function deleteEquipmentResearchDiscordCard(
  messageId: string,
): Promise<void> {
  const response = await fetch(
    buildWebhookMessageUrl(getEquipmentResearchWebhookUrl(), messageId),
    {
      method: "DELETE",
      cache: "no-store",
    },
  );
  if (response.status === 404 || response.ok) return;
  const errorText = await response.text();
  throw new Error(
    `Discord 연구 카드 삭제 실패 (${response.status}): ${errorText}`,
  );
}

export async function notifyApplySubmission(input: ApplyFormInput) {
  // 가입 신청 전용 임베드 포맷입니다.
  const payload = buildPayload("가입 신청 접수", DISCORD_COLORS.apply, [
    { name: "이름", value: input.name, inline: true },
    { name: "이메일", value: input.email, inline: true },
    { name: "지원 동기", value: input.motivation || "(비어 있음)" },
  ]);

  await sendDiscordWebhook(payload);
}

export async function notifyContactSubmission(input: ContactFormInput) {
  // 문의 전용 임베드 포맷입니다.
  const payload = buildPayload("문의 접수", DISCORD_COLORS.contact, [
    { name: "이름", value: input.name, inline: true },
    { name: "이메일", value: input.email, inline: true },
    { name: "제목", value: input.subject || "(비어 있음)" },
    { name: "문의 내용", value: input.message || "(비어 있음)" },
  ]);

  await sendDiscordWebhook(payload);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* P7 — 캐릭터 편집 GM 채널 알림                                           */
/* ──────────────────────────────────────────────────────────────────────── */

/** Discord embed value 길이 제약 (1024자). 안전 마진으로 1000자에서 자른다. */
const DISCORD_FIELD_VALUE_MAX = 1000;
/** Discord embed 최대 field 수 (25). audit 노이즈/UX 고려해 10개로 제한. */
const MAX_CHANGE_FIELDS = 10;

/**
 * P7 — 캐릭터 편집 알림 페이로드.
 *
 * route handler 가 audit insert 직후 fire-and-forget 으로 호출.
 * 응답 시간/사용자 경험에 영향 X (실패는 console.warn 만).
 */
export interface CharacterEditWebhookPayload {
  character: { id: string; codename: string; name: string };
  actor: { id: string; displayName: string; role: string };
  source: "admin" | "player";
  actorIsOwner: boolean;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  reason?: string;
  timestamp: Date;
}

export interface EquipmentWorkshopRequestWebhookPayload {
  kind: "upgrade" | "custom" | "reload";
  character: { id: string; codename: string; name: string };
  requester: { id: string; displayName: string };
  details: string;
  equipmentName?: string;
  timestamp: Date;
}

export interface GmAdminAuditWebhookPayload {
  action: string;
  actor: { id: string; displayName: string; role: string };
  summary: string;
  target?: string;
  details?: DiscordEmbedField[];
  timestamp: Date;
}

function getSiteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.ordonet.co.kr").replace(
    /\/+$/,
    "",
  );
}

function getCharacterPageUrl(characterId: string): string {
  return `${getSiteBaseUrl()}/erp/characters/${characterId}`;
}

function isPlayerSelfEdit(payload: CharacterEditWebhookPayload): boolean {
  return payload.source === "player";
}

/** GM 캐릭터 편집과 GM 관리 감사가 공유하는 알림 채널. */
function getCharacterAdminEditWebhookUrl(): string | undefined {
  return (
    process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL ||
    process.env.DISCORD_WEBHOOK_URL
  );
}

function getCharacterEditWebhookUrl(
  payload: CharacterEditWebhookPayload,
): string | undefined {
  if (isPlayerSelfEdit(payload)) {
    return getCharacterSelfEditWebhookUrl();
  }

  return getCharacterAdminEditWebhookUrl();
}

function getCharacterSelfEditWebhookUrl(): string | undefined {
  return (
    process.env.DISCORD_WEBHOOK_CHAR_EDIT_URL ||
    process.env.DISCORD_WEBHOOK_CHAR_SELF_EDIT_URL ||
    process.env.DISCORD_WEBHOOK_CHARACTER_SELF_EDIT_URL ||
    process.env.DISCORD_WEBHOOK_URL
  );
}

function getCharacterEditWarning(payload: CharacterEditWebhookPayload): string {
  if (isPlayerSelfEdit(payload)) {
    return "유저 자가편집입니다. GM 확인 전까지 변경 내용을 검토해 주세요.";
  }

  return "GM/운영진 직접 수정입니다. 변경 내용은 즉시 반영되었고 감사 로그에 기록됩니다.";
}

/**
 * Discord mention syntax 무력화. 사용자 제어 가능 텍스트(quote/appearance/reason 등)가
 * embed 로 흘러갈 때 `@everyone`, `<@123>`, `<@&123>`, `<#123>` 같은 ping 트리거를
 * zero-width space 로 분리해 mention 발화를 차단.
 *
 * GM 전용 채널이라 영향 범위는 좁지만 신뢰성/혼동 방지 차원에서 적용.
 */
function sanitizeForDiscord(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<(@[!&]?|#)(\d+)>/g, "<$1​$2>");
}

/**
 * Discord embed 의 field value 로 변환. 1000자 컷, 줄바꿈 보존.
 *
 * 객체/배열은 JSON 직렬화. 이미지 URL도 그대로 노출 (Discord 가 자동 미리보기).
 * string 값은 mention sanitize 적용.
 */
function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "(비어 있음)";
  if (typeof value === "string") {
    return sanitizeForDiscord(value || "(빈 문자열)");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return sanitizeForDiscord(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/**
 * 한 변경 항목을 Discord field value 로 직렬화.
 * `before → after` 형식. 길이 초과 시 절단.
 */
function formatChange(change: {
  field: string;
  before: unknown;
  after: unknown;
}): string {
  const before = formatChangeValue(change.before);
  const after = formatChangeValue(change.after);
  const combined = `${before}\n→\n${after}`;
  if (combined.length <= DISCORD_FIELD_VALUE_MAX) return combined;

  // 양쪽 절반 균등 컷
  const half = Math.floor((DISCORD_FIELD_VALUE_MAX - 8) / 2);
  return `${before.slice(0, half)}…\n→\n${after.slice(0, half)}…`;
}

function formatKstTimestamp(date: Date): string {
  // KST 한국어 포맷 (footer 표시용)
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* 편의점 일일 입고 알림                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export interface ShopRestockWebhookItem {
  name: string;
  icon: string;
  stock: number;
  price: number;
  pageGroup: "BASIC" | "RECOVERY" | "LUXURY" | "RARE";
}

export interface ShopRestockWebhookPayload {
  today: string;
  isOpen: boolean;
  openMode?: "auto" | "open" | "closed";
  scheduledOpen?: boolean;
  items: ShopRestockWebhookItem[];
}

export interface ShopReorderWebhookPayload {
  today: string;
  item: {
    slug: string;
    name: string;
    icon: string;
    price: number;
    pageGroup: "BASIC" | "RECOVERY" | "LUXURY" | "RARE";
  };
  requester: {
    id: string;
    displayName: string;
  };
  character?: {
    id: string;
    codename: string;
  };
  requestedAt: Date;
}

export interface ShopReorderFulfilledWebhookPayload {
  today: string;
  item: {
    slug: string;
    name: string;
    icon: string;
    price: number;
    pageGroup: "BASIC" | "RECOVERY" | "LUXURY" | "RARE";
  };
  quantity: number;
  stock: number;
  fulfilledAt: Date;
}

const SHOP_GROUP_ORDER: ShopRestockWebhookItem["pageGroup"][] = [
  "BASIC",
  "RECOVERY",
  "LUXURY",
  "RARE",
];

const SHOP_GROUP_LABELS: Record<ShopRestockWebhookItem["pageGroup"], string> = {
  BASIC: "기본 물품",
  RECOVERY: "회복 물품",
  LUXURY: "기호품",
  RARE: "희귀 물품",
};
const SHOP_WEB_URL = "https://www.ordonet.co.kr/erp/shop";

function getShopWebhookUrl(): string {
  const webhookUrl = process.env.DISCORD_WEBHOOK_SHOP_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_SHOP_URL 환경변수가 설정되지 않았습니다.");
  }
  return webhookUrl;
}

function formatShopRestockFields(
  items: ShopRestockWebhookItem[],
): DiscordEmbedField[] {
  return SHOP_GROUP_ORDER.flatMap((group) => {
    const lines = items
      .filter((item) => item.pageGroup === group)
      .map((item) => {
        const name = sanitizeForDiscord(item.name);
        const price = item.price.toLocaleString("ko-KR");
        return `${item.icon} ${name} x${item.stock} · ${price}C`;
      });

    if (lines.length === 0) return [];

    return [
      {
        name: SHOP_GROUP_LABELS[group],
        value: lines.join("\n").slice(0, DISCORD_FIELD_VALUE_MAX),
      },
    ];
  });
}

function formatShopRestockStatusLine(
  payload: ShopRestockWebhookPayload,
): string {
  if (payload.openMode === "open") {
    return "지금은 GM이 문 열어뒀어요. 필요한 거 있으면 바로 들러요.";
  }

  if (payload.openMode === "closed") {
    return "지금은 GM이 잠깐 셔터 내려뒀어요. 새로 들어온 물건은 미리 봐둬도 돼요.";
  }

  if (payload.isOpen) {
    return "지금은 문 열려 있어요. 필요한 거 있으면 바로 들러요.";
  }

  return "지금은 영업 시간이 아니라 바로 구매는 어려워요. 새로 들어온 물건은 미리 봐둬도 돼요.";
}

export function buildShopRestockDiscordPayload(
  payload: ShopRestockWebhookPayload,
): DiscordPayload | null {
  const items = payload.items.filter((item) => item.stock > 0);
  if (items.length === 0) return null;

  const fields = [
    ...formatShopRestockFields(items),
    {
      name: "편의점으로 가기",
      value: `[띠아 편의점 들어가기](${SHOP_WEB_URL})`,
    },
  ];
  return {
    username: "띠아",
    avatar_url: process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "편의점 입고 알림",
        url: SHOP_WEB_URL,
        description: [
          "오늘 새로 들어온 물건들이에요.",
          formatShopRestockStatusLine(payload),
        ].join("\n"),
        color: DISCORD_COLORS.shopRestock,
        fields,
        footer: { text: `${payload.today} KST` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function createDailyShopRestockDiscordMessage(
  payload: DiscordPayload,
): Promise<string> {
  const url = new URL(getShopWebhookUrl());
  url.searchParams.set("wait", "true");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Discord 편의점 입고 공지 생성 실패 (${response.status}): ${errorText}`,
    );
  }
  const message = (await response.json()) as { id?: unknown };
  if (typeof message.id !== "string" || message.id.length === 0) {
    throw new Error("Discord 편의점 입고 공지 응답에 message id가 없습니다.");
  }
  return message.id;
}

export async function deleteDailyShopRestockDiscordMessage(
  messageId: string,
): Promise<void> {
  const response = await fetch(
    buildWebhookMessageUrl(getShopWebhookUrl(), messageId),
    {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.ok) return;
  const errorText = await response.text();
  throw new Error(
    `Discord 편의점 입고 공지 삭제 실패 (${response.status}): ${errorText}`,
  );
}

export async function notifyShopReorderRequest(
  payload: ShopReorderWebhookPayload,
): Promise<"sent" | "skipped"> {
  const webhookUrl = getCharacterSelfEditWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[notifyShopReorderRequest] DISCORD_WEBHOOK_CHAR_EDIT_URL/DISCORD_WEBHOOK_URL 미설정 — silent skip",
    );
    return "skipped";
  }

  const fields: DiscordEmbedField[] = [
    {
      name: "요청 품목",
      value: [
        payload.item.icon,
        sanitizeForDiscord(payload.item.name),
        `(${payload.item.slug})`,
      ].join(" "),
      inline: true,
    },
    {
      name: "분류 / 가격",
      value: [
        SHOP_GROUP_LABELS[payload.item.pageGroup],
        `${payload.item.price.toLocaleString("ko-KR")}C`,
      ].join(" · "),
      inline: true,
    },
    {
      name: "요청자",
      value: sanitizeForDiscord(payload.requester.displayName),
      inline: true,
    },
  ];

  if (payload.character) {
    fields.push({
      name: "대표 캐릭터",
      value: sanitizeForDiscord(payload.character.codename),
      inline: true,
    });
  }

  fields.push(
    {
      name: "요청 시각",
      value: formatKstTimestamp(payload.requestedAt),
      inline: true,
    },
    {
      name: "재고 관리",
      value: `[편의점 재고 확인](${SHOP_WEB_URL})`,
    },
  );

  const discordPayload: DiscordPayload = {
    username: "띠아",
    avatar_url: process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "편의점 발주 요청",
        url: SHOP_WEB_URL,
        description: [
          "품절 상품 발주 요청이 들어왔어요.",
          "GM 재고 관리에서 입고 여부를 확인해 주세요.",
        ].join("\n"),
        color: DISCORD_COLORS.shopReorder,
        fields,
        footer: { text: `${payload.today} KST` },
        timestamp: payload.requestedAt.toISOString(),
      },
    ],
  };

  try {
    await sendDiscordWebhook(discordPayload, webhookUrl);
    return "sent";
  } catch (error) {
    console.warn("[notifyShopReorderRequest] Discord 전송 실패:", error);
    return "skipped";
  }
}

export async function notifyShopReorderFulfilled(
  payload: ShopReorderFulfilledWebhookPayload,
): Promise<"sent" | "skipped"> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_SHOP_URL;
  if (!webhookUrl) {
    console.warn(
      "[notifyShopReorderFulfilled] DISCORD_WEBHOOK_SHOP_URL 미설정 — silent skip",
    );
    return "skipped";
  }

  const fields: DiscordEmbedField[] = [
    {
      name: "입고 품목",
      value: [
        payload.item.icon,
        sanitizeForDiscord(payload.item.name),
        `(${payload.item.slug})`,
      ].join(" "),
      inline: true,
    },
    {
      name: "추가 수량 / 현재 재고",
      value: `+${payload.quantity.toLocaleString("ko-KR")} EA · ${payload.stock.toLocaleString("ko-KR")} EA`,
      inline: true,
    },
    {
      name: "편의점으로 가기",
      value: `[띠아 편의점 들어가기](${SHOP_WEB_URL})`,
    },
  ];

  const discordPayload: DiscordPayload = {
    username: "띠아",
    avatar_url: process.env.DISCORD_WEBHOOK_SHOP_AVATAR_URL || undefined,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "편의점 추가 입고 완료",
        url: SHOP_WEB_URL,
        description: "품목이 추가 입고됐어요.",
        color: DISCORD_COLORS.shopRestock,
        fields,
        footer: { text: `${payload.today} KST` },
        timestamp: payload.fulfilledAt.toISOString(),
      },
    ],
  };

  try {
    await sendDiscordWebhook(discordPayload, webhookUrl);
    return "sent";
  } catch (error) {
    console.warn("[notifyShopReorderFulfilled] Discord 전송 실패:", error);
    return "skipped";
  }
}

/**
 * P7 — 캐릭터 편집 GM 채널 알림.
 *
 * `DISCORD_WEBHOOK_CHAR_EDIT_URL`을 우선하고, 없으면 기존
 * `DISCORD_WEBHOOK_URL`로 fallback한다. 두 값이 모두 없을 때만 silent skip한다.
 *
 * fire-and-forget 호출 가정 — 본 함수는 throw 하지 않고 모든 실패를 console.warn 으로 흡수.
 * 호출자가 `.catch()` 등록만 해도 안전하지만 본 함수가 swallow 해 두 번째 안전망 제공.
 */
export async function notifyCharacterEdit(
  payload: CharacterEditWebhookPayload,
): Promise<void> {
  const webhookUrl = getCharacterEditWebhookUrl(payload);
  if (!webhookUrl) {
    console.warn(
      "[notifyCharacterEdit] DISCORD_WEBHOOK_CHAR_EDIT_URL/DISCORD_WEBHOOK_URL 미설정 — silent skip",
    );
    return;
  }

  try {
    const { character, actor, source, actorIsOwner, changes, reason, timestamp } =
      payload;
    const playerEdit = isPlayerSelfEdit(payload);
    const editKind = playerEdit ? "유저 자가편집" : "GM 직접 수정";

    const total = changes.length;
    const visibleChanges = changes.slice(0, MAX_CHANGE_FIELDS);
    const overflow = total - visibleChanges.length;

    const fields: DiscordEmbedField[] = [
      {
        name: "경고",
        value: getCharacterEditWarning(payload),
      },
      ...visibleChanges.map((change) => ({
        name: change.field.slice(0, 256), // Discord field name 256자 제한
        value: formatChange(change),
      })),
    ];

    if (overflow > 0) {
      fields.push({
        name: "더 많은 변경",
        value: `+${overflow} more`,
      });
    }

    if (reason && reason.trim()) {
      // reason 은 별도 field 로 추가 — embed 최상단 가까이 노출되도록 changes 보다 앞엔
      // 두지 않고 명시적 라벨로 구분. mention sanitize 필수 (사용자 입력).
      fields.push({
        name: "변경 사유",
        value: sanitizeForDiscord(reason).slice(0, DISCORD_FIELD_VALUE_MAX),
      });
    }

    const description = `${sanitizeForDiscord(actor.displayName)} · ${actor.role}\n${
      actorIsOwner ? "소유자 자가편집" : "관리자 편집"
    }`;

    const embed: DiscordEmbed = {
      title: `캐릭터 ${editKind}: ${character.name} (${character.codename})`.slice(
        0,
        256,
      ),
      url: getCharacterPageUrl(character.id),
      description,
      color: playerEdit
        ? DISCORD_COLORS.charEditPlayer
        : source === "admin"
          ? DISCORD_COLORS.charEditAdmin
          : DISCORD_COLORS.charEditPlayer,
      fields,
      footer: { text: formatKstTimestamp(timestamp) },
      timestamp: timestamp.toISOString(),
    };

    const discordPayload: DiscordPayload = {
      username: playerEdit ? "StarGate Character Watch" : "StarGate Audit Bot",
      allowed_mentions: { parse: [] },
      embeds: [embed],
    };

    await sendDiscordWebhook(discordPayload, webhookUrl);
  } catch (err) {
    console.warn(
      `[notifyCharacterEdit] 전송 실패 character=${payload.character.id} actor=${payload.actor.id}:`,
      err,
    );
  }
}

/** 공방 문의를 캐릭터 자가편집과 같은 GM 검토 채널에 전달한다. */
export async function notifyEquipmentWorkshopRequest(
  payload: EquipmentWorkshopRequestWebhookPayload,
): Promise<void> {
  const webhookUrl = getCharacterSelfEditWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[notifyEquipmentWorkshopRequest] DISCORD_WEBHOOK_CHAR_EDIT_URL/DISCORD_WEBHOOK_URL 미설정 — silent skip",
    );
    return;
  }

  const requestLabel =
    payload.kind === "upgrade"
      ? "장착 장비 강화 문의"
      : payload.kind === "reload"
        ? "장비 액션 재장전 결재 요청"
        : "커스텀 장비 제작 의뢰";
  const fields: DiscordEmbedField[] = [
    {
      name: "신청자",
      value: `${sanitizeForDiscord(payload.requester.displayName)} · ${sanitizeForDiscord(payload.character.codename)}`,
    },
    ...(payload.equipmentName
      ? [
          {
            name: "대상 장비",
            value: sanitizeForDiscord(payload.equipmentName),
          },
        ]
      : []),
    {
      name: "요청 내용",
      value: sanitizeForDiscord(payload.details).slice(
        0,
        DISCORD_FIELD_VALUE_MAX,
      ),
    },
  ];
  const discordPayload: DiscordPayload = {
    username: "StarGate Workshop Intake",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `공방 ${requestLabel}: ${sanitizeForDiscord(payload.character.codename)}`.slice(
          0,
          256,
        ),
        url: getCharacterPageUrl(payload.character.id),
        description: `${sanitizeForDiscord(payload.character.name)} 캐릭터 편집 검토 필요`,
        color: DISCORD_COLORS.charEditPlayer,
        fields,
        footer: { text: formatKstTimestamp(payload.timestamp) },
        timestamp: payload.timestamp.toISOString(),
      },
    ],
  };

  try {
    await sendDiscordWebhook(discordPayload, webhookUrl);
  } catch (error) {
    console.warn(
      `[notifyEquipmentWorkshopRequest] 전송 실패 character=${payload.character.id} requester=${payload.requester.id}:`,
      error,
    );
  }
}

/**
 * GM 관리 작업 공용 감사 알림.
 *
 * 지급·권한·재고 등 관리 API 1회당 메시지 1개를 남긴다. 호출부는 성공한
 * mutation 뒤에서만 예약하며, GM 캐릭터 편집과 같은 webhook resolver를
 * 사용한다. Discord 장애가 원래 작업 결과를 뒤집지 않도록 모든 실패를
 * 흡수한다.
 */
export async function notifyGmAdminAudit(
  payload: GmAdminAuditWebhookPayload,
): Promise<"sent" | "skipped"> {
  if (payload.actor.role !== "GM") return "skipped";

  const webhookUrl = getCharacterAdminEditWebhookUrl();
  if (!webhookUrl) {
    console.warn(
      "[notifyGmAdminAudit] DISCORD_WEBHOOK_CHAR_EDIT_URL/DISCORD_WEBHOOK_URL 미설정 — silent skip",
    );
    return "skipped";
  }

  const fields: DiscordEmbedField[] = [
    {
      name: "작업 요약",
      value: sanitizeForDiscord(payload.summary).slice(
        0,
        DISCORD_FIELD_VALUE_MAX,
      ),
    },
  ];

  if (payload.target?.trim()) {
    fields.push({
      name: "대상",
      value: sanitizeForDiscord(payload.target).slice(
        0,
        DISCORD_FIELD_VALUE_MAX,
      ),
    });
  }

  for (const detail of payload.details?.slice(0, 8) ?? []) {
    fields.push({
      ...detail,
      name: sanitizeForDiscord(detail.name).slice(0, 256),
      value: sanitizeForDiscord(detail.value).slice(
        0,
        DISCORD_FIELD_VALUE_MAX,
      ),
    });
  }

  const discordPayload: DiscordPayload = {
    username: "StarGate Admin Watch",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `GM 관리 작업: ${sanitizeForDiscord(payload.action)}`.slice(
          0,
          256,
        ),
        description: `${sanitizeForDiscord(payload.actor.displayName)} · GM`,
        color: DISCORD_COLORS.charEditAdmin,
        fields,
        footer: { text: `actor ${payload.actor.id}` },
        timestamp: payload.timestamp.toISOString(),
      },
    ],
  };

  try {
    await sendDiscordWebhook(discordPayload, webhookUrl);
    return "sent";
  } catch (error) {
    console.warn("[notifyGmAdminAudit] Discord 전송 실패:", error);
    return "skipped";
  }
}
